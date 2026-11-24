(() => {
  const form = document.getElementById("level-data-form");
  const input = document.getElementById("level-id-input");
  const enter = document.getElementById("level-data-enter");
  const status = document.getElementById("level-lookup-status");
  const result = document.getElementById("level-data-result");
  const text = document.getElementById("level-data-text");
  const copy = document.getElementById("copy-level-data");
  const copyStatus = document.getElementById("level-copy-status");
  const copyIcon = copy.innerHTML;
  let activeRequest;
  let copyTimer;

  function resetCopy() {
    clearTimeout(copyTimer);
    copy.innerHTML = copyIcon;
    copy.title = "Copy level data";
    copy.setAttribute("aria-label", "Copy level data");
    copyStatus.textContent = "";
  }

  input.addEventListener("input", () => {
    input.setCustomValidity("");
    input.removeAttribute("aria-invalid");
    activeRequest?.abort();
    activeRequest = null;
    enter.disabled = false;
    form.setAttribute("aria-busy", "false");
    status.textContent = "";
    text.value = "";
    result.hidden = true;
    copy.disabled = true;
    resetCopy();
  });
  input.addEventListener("invalid", () => {
    input.setCustomValidity("Enter exactly 6 digits.");
    input.setAttribute("aria-invalid", "true");
    status.textContent = "Enter exactly 6 digits.";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const levelId = input.value;
    if (!/^[0-9]{6}$/.test(levelId)) {
      status.textContent = "Enter exactly 6 digits.";
      input.setAttribute("aria-invalid", "true");
      input.focus();
      return;
    }
    activeRequest?.abort();
    const controller = new AbortController();
    activeRequest = controller;
    resetCopy();
    result.hidden = true;
    text.value = "";
    copy.disabled = true;
    enter.disabled = true;
    form.setAttribute("aria-busy", "true");
    status.textContent = "Loading level data…";
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      if (!window.NV2_LEVEL_DATA_ENDPOINT) throw new Error("Level lookup is not available yet.");
      const url = new URL(window.NV2_LEVEL_DATA_ENDPOINT, location.origin);
      url.searchParams.set("l", levelId);
      const response = await fetch(url, { signal: controller.signal, credentials: "omit" });
      if (response.status === 404) throw new Error("Level not found.");
      if (response.status === 429) throw new Error("Too many requests. Please try again shortly.");
      if (!response.ok) throw new Error("Level data is unavailable. Please try again.");
      const value = await response.text();
      // Only accept a complete import string; never put a server error in the box.
      if (!/^%[^#\r\n]*#[0-9a-f]+#$/i.test(value)) {
        throw new Error("The server returned invalid level data. Please try again.");
      }
      if (activeRequest !== controller) return;
      text.value = value;
      result.hidden = false;
      copy.disabled = false;
      status.textContent = `Level ${levelId}`;
    } catch (error) {
      if (activeRequest !== controller) return;
      status.textContent = error.name === "AbortError"
        ? "The request timed out. Please try again."
        : error.message;
    } finally {
      clearTimeout(timeout);
      if (activeRequest === controller) {
        activeRequest = null;
        enter.disabled = false;
        form.setAttribute("aria-busy", "false");
      }
    }
  });

  copy.addEventListener("click", async () => {
    const value = text.value;
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      if (text.value !== value) return;
      copyStatus.textContent = "Level data copied.";
      copy.setAttribute("aria-label", "Level data copied");
      copy.title = "Copied";
      copy.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg>';
      clearTimeout(copyTimer);
      copyTimer = setTimeout(resetCopy, 2000);
    } catch {
      text.focus();
      text.select();
      copyStatus.textContent = "Copy unavailable. The level data is selected; use your copy shortcut.";
    }
  });
})();
