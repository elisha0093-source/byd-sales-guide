const SESSION_SECONDS = 60 * 60 * 24 * 7;
const encoder = new TextEncoder();

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

async function safePasswordMatch(input, expected) {
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(input)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected))
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let different = a.length ^ b.length;
  for (let i = 0; i < Math.min(a.length, b.length); i++) different |= a[i] ^ b[i];
  return different === 0;
}

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const item = cookie.split(";").map(v => v.trim()).find(v => v.startsWith(`${name}=`));
  return item ? item.slice(name.length + 1) : "";
}

async function validSession(request, secret) {
  const token = getCookie(request, "byd_guide_session");
  const [expiresText, signature] = token.split(".");
  const expires = Number(expiresText);
  if (!expires || !signature || expires <= Math.floor(Date.now() / 1000)) return false;
  return signature === await hmac(expiresText, secret);
}

function loginPage(error = "") {
  const errorHtml = error ? `<p class="error">${error}</p>` : "";
  return new Response(`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>BYD Sales Guide 로그인</title>
<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:linear-gradient(135deg,#071625,#123c60);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;color:#152433}.box{width:min(420px,calc(100% - 32px));background:#fff;border-radius:22px;padding:30px;box-shadow:0 24px 70px #0006}.logo{font-size:24px;font-weight:900;color:#0b1b2b}.sub{margin:7px 0 24px;color:#6a7885;font-size:14px;line-height:1.55}label{display:block;margin-bottom:8px;font-weight:800}input{width:100%;padding:14px;border:1px solid #cfd9e2;border-radius:12px;font-size:17px;outline:none}input:focus{border-color:#0b68c4;box-shadow:0 0 0 3px #0b68c422}button{width:100%;margin-top:13px;padding:14px;border:0;border-radius:12px;background:#0b68c4;color:white;font-size:16px;font-weight:900;cursor:pointer}.error{margin:0 0 14px;padding:10px 12px;border-radius:10px;background:#fff0f1;color:#b42335;font-size:13px}.note{margin:16px 0 0;color:#7b8893;font-size:12px;text-align:center}</style></head>
<body><main class="box"><div class="logo">BYD SALES GUIDE</div><p class="sub">직원 전용 자료입니다.<br>공유받은 비밀번호를 입력해 주세요.</p>${errorHtml}
<form method="post" action="/login"><label for="password">공통 비밀번호</label><input id="password" name="password" type="password" required autofocus autocomplete="current-password"><button type="submit">자료 열기</button></form>
<p class="note">인증 후 이 브라우저에서 7일간 유지됩니다.</p></main></body></html>`, {
    status: error ? 401 : 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
  });
}

export default {
  async fetch(request, env) {
    if (!env.SHARED_PASSWORD || !env.SESSION_SECRET) {
      return new Response("Cloudflare Secret 설정이 필요합니다.", { status: 503 });
    }

    const url = new URL(request.url);

    if (url.pathname === "/login" && request.method === "POST") {
      const form = await request.formData();
      const password = String(form.get("password") || "");
      if (!(await safePasswordMatch(password, env.SHARED_PASSWORD))) {
        return loginPage("비밀번호가 일치하지 않습니다.");
      }
      const expires = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
      const token = `${expires}.${await hmac(expires, env.SESSION_SECRET)}`;
      return new Response(null, {
        status: 303,
        headers: {
          "Location": "/",
          "Set-Cookie": `byd_guide_session=${token}; Max-Age=${SESSION_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax`,
          "Cache-Control": "no-store"
        }
      });
    }

    if (url.pathname === "/logout" && request.method === "POST") {
      return new Response(null, {
        status: 303,
        headers: {
          "Location": "/",
          "Set-Cookie": "byd_guide_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
          "Cache-Control": "no-store"
        }
      });
    }

    if (!(await validSession(request, env.SESSION_SECRET))) return loginPage();

    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Robots-Tag", "noindex, nofollow");
    headers.set("X-Frame-Options", "DENY");
    headers.set("Referrer-Policy", "no-referrer");
    return new Response(response.body, { status: response.status, headers });
  }
};
