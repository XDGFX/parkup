// A one-time banner for adding parkup to the home screen: an Install button on Android (beforeinstallprompt),
// a "Share → Add to Home Screen" hint on iOS, where Safari has no install prompt. Shown at most once per device.

const SEEN = "parkup.install-banner-seen";

type InstallPrompt = Event & { prompt(): Promise<void> };

const seen = () => { try { return localStorage.getItem(SEEN) === "1"; } catch { return false; } };
const markSeen = () => { try { localStorage.setItem(SEEN, "1"); } catch { /* private mode: it may show again */ } };

const standalone = () => matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
// iPadOS reports itself as a Mac, so tell it by touch.
const ios = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

export function installBanner(root: HTMLElement) {
  if (seen() || standalone()) return;

  function show(html: string, onAccept?: () => void) {
    if (seen()) return;
    markSeen();
    const t = document.createElement("template");
    t.innerHTML = `<div class="install" role="dialog" aria-label="Add parkup to your home screen">
      <img src="./icon-180.png" alt="" width="40" height="40"><p>${html}</p>
      ${onAccept ? `<button class="install-go">Install</button>` : ""}
      <button class="install-close" aria-label="Dismiss">✕</button></div>`;
    const el = t.content.firstElementChild as HTMLElement;
    el.querySelector<HTMLButtonElement>(".install-close")!.onclick = () => el.remove();
    const go = el.querySelector<HTMLButtonElement>(".install-go");
    if (go && onAccept) go.onclick = () => { el.remove(); onAccept(); };
    root.append(el);
  }

  if (ios()) {
    show(`Add parkup to your home screen: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.`);
    return;
  }
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    show(`Add parkup to your home screen, so it opens like an app.`, () => void (e as InstallPrompt).prompt());
  }, { once: true });
}
