(() => {
  const page = document.body?.dataset?.page || "unknown";
  console.log("Frog Social client init", page);

  window.addEventListener("DOMContentLoaded", async () => {
    const fromQuery = new URLSearchParams(window.location.search).get("apiBase");
    const apiBase = fromQuery ? fromQuery.replace(/\/+$/, "") : "";
    const healthUrl = `${apiBase}/api/health`;

    try {
      console.log("INIT health check start", healthUrl);
      const response = await fetch(healthUrl, { method: "GET" });
      console.log("INIT health check result", response.status);
    } catch (error) {
      console.warn("INIT health check failed", error);
    }
  });
})();
