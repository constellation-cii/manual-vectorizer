/** Header user menu + logout for authenticated pages. */

async function initAuthNav() {
  const nav = document.querySelector("header nav");
  if (!nav || nav.querySelector(".auth-nav")) return;

  try {
    const res = await fetch("/api/me", { credentials: "same-origin" });
    if (!res.ok) return;
    const me = await res.json();

    const wrap = document.createElement("div");
    wrap.className = "auth-nav";

    const email = document.createElement("span");
    email.className = "auth-nav-email";
    email.textContent = me.email;

    const links = document.createElement("div");
    links.className = "auth-nav-links";

    if (me.role === "admin") {
      const admin = document.createElement("a");
      admin.href = "/admin";
      admin.textContent = "Admin";
      links.appendChild(admin);
    }

    const account = document.createElement("a");
    account.href = "/account";
    account.textContent = "Account";
    links.appendChild(account);

    const logoutForm = document.createElement("form");
    logoutForm.method = "post";
    logoutForm.action = "/logout";
    const logoutBtn = document.createElement("button");
    logoutBtn.type = "submit";
    logoutBtn.className = "btn-link";
    logoutBtn.textContent = "Log out";
    logoutForm.appendChild(logoutBtn);
    links.appendChild(logoutForm);

    wrap.append(email, links);
    nav.appendChild(wrap);
  } catch {
    // ignore
  }
}

initAuthNav();
