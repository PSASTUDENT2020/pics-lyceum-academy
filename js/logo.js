// ============================================================
// LOGO LOADER — used on every page with a .seal / .seal-sm
// element (id="logoSeal"). Tries the static logo file first;
// if it's missing, the "PLA" text seal already in the HTML
// stays exactly as-is (no error shown to the user).
//
// To change the logo, just replace the file at that path in
// the repo — no code change needed.
// ============================================================

const LOGO_PATH = "assets/ACADEMY LOGO.jpg";

(function loadLogo() {
  const target = document.getElementById("logoSeal");
  if (!target) return;

  const img = new Image();
  img.src = encodeURI(LOGO_PATH);
  img.alt = "Pics Lyceum Academy Logo";

  img.onload = () => {
    target.innerHTML = "";
    target.appendChild(img);
  };

  // onerror: do nothing — the text seal already in the markup
  // stays as the fallback.
})();
