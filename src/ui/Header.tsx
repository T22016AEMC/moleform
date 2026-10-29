import './components/components.css';

export function Header() {
  return (
    <header className="site-header">
      <img
        src={`${import.meta.env.BASE_URL}logo-header.png`}
        alt="MoleForm 化學配方物性與交聯預測"
        height={60}
      />
      <p>建置 {__BUILD_TIME__} · {__GIT_COMMIT__}</p>
    </header>
  );
}