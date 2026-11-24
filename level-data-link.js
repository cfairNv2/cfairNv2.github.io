(() => {
  const form = document.getElementById("player-search-form");
  if (!form) return;

  const link = document.createElement("a");
  link.className = "level-data-link";
  link.href = "/userlevel/level-data/";
  link.textContent = "Level Data";
  link.hidden = true;
  form.prepend(link);

  // The shared app changes routes with pushState and then updates data-page.
  // Watch that render signal so switching sections and Back/Forward stay in sync.
  const sync = () => {
    const route = window.Nv2Routes?.read();
    link.hidden = !route || route.page === "home" || route.params.get("levels") !== "user";
    const destination = new URL("/userlevel/level-data/", window.location.origin);
    destination.searchParams.set("returnTo", window.location.pathname + window.location.search + window.location.hash);
    link.href = destination.href;
  };
  new MutationObserver(sync).observe(document.body, {
    attributes: true,
    attributeFilter: ["data-page"],
  });
  window.addEventListener("popstate", sync);
  sync();
})();
