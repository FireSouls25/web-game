interface Props {
  hasSave: boolean;
  onNewGame: () => void;
  onContinue: () => void;
  onCredits: () => void;
  onFullscreen: () => void;
}

export function MainMenu({ hasSave, onNewGame, onContinue, onCredits, onFullscreen }: Props) {
  return (
    <div className="menu">
      <div className="menu-card">
        <div className="menu-over">Anno 1897 · somewhere in England</div>
        <h1 className="menu-title">MANOR LOOP</h1>
        <div className="menu-sub">A Victorian time-loop — prototype</div>
        <nav className="menu-buttons">
          <button onClick={onNewGame} autoFocus>
            New game
          </button>
          {hasSave && <button onClick={onContinue}>Continue</button>}
          <button onClick={onCredits}>Credits</button>
          <button onClick={onFullscreen} className="ghost">
            Fullscreen
          </button>
        </nav>
        <div className="menu-foot">
          Move: WASD / arrows · Esc returns here · progress autosaves in this browser
        </div>
      </div>
    </div>
  );
}
