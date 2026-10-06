export function Credits({ onBack }: { onBack: () => void }) {
  return (
    <div className="menu">
      <div className="menu-card">
        <div className="menu-over">Credits</div>
        <h1 className="menu-title small">MANOR LOOP</h1>
        <div className="credits-body">
          <p>
            Prototype art — <strong>Kenney · Prototype Pack</strong>
            <br />
            <a href="https://www.kenney.nl" target="_blank" rel="noreferrer">
              www.kenney.nl
            </a>{' '}
            · Creative Commons Zero (CC0)
          </p>
          <p className="dim">
            Free to use in personal, educational and commercial projects. Credited here with
            thanks (not mandatory under CC0).
          </p>
          <p className="dim">A time-loop mystery in a Victorian manor. Prototype — more to come.</p>
        </div>
        <nav className="menu-buttons">
          <button onClick={onBack}>Back</button>
        </nav>
      </div>
    </div>
  );
}
