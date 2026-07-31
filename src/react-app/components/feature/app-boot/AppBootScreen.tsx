export function AppBootScreen() {
  return (
    <div
      className="app-boot-screen"
      role="status"
      aria-live="polite"
      aria-label="万界道友正在加载"
    >
      <div className="app-boot-content">
        <div className="app-boot-seal" aria-hidden="true">
          道
        </div>
        <p className="app-boot-title">万界道友</p>
        <div className="app-boot-progress" aria-hidden="true" />
        <p className="app-boot-message">正在载入天地……</p>
      </div>
    </div>
  );
}
