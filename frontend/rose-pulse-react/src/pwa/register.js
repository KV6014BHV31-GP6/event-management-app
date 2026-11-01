export async function registerPublicShell({
  production = import.meta.env.PROD,
  navigatorImpl = globalThis.navigator,
} = {}) {
  if (
    !production ||
    !navigatorImpl?.serviceWorker ||
    !globalThis.isSecureContext
  )
    return { available: false };
  try {
    const registration = await navigatorImpl.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    await navigatorImpl.serviceWorker.ready;
    return { available: true, registration };
  } catch {
    return { available: false };
  }
}
