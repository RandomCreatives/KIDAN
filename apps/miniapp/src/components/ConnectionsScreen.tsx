import { Brand } from "./Brand";
import { ChevronRightIcon, ClockIcon, LockIcon, ShieldCheckIcon } from "./Icons";

export function ConnectionsScreen() {
  return (
    <main className="screen standard-screen">
      <header className="topbar"><Brand /><span className="header-label">Connections</span></header>
      <section className="page-intro">
        <span className="section-kicker">Private by design</span>
        <h1>Your connections</h1>
        <p>Only mutual interest appears here. One-sided decisions are never shown.</p>
      </section>

      <section className="status-card pending-card">
        <div className="status-icon amber"><ClockIcon /></div>
        <div className="status-copy"><span>Pending review</span><strong>One introduction is with the admin</strong><p>No identity or contact information has been shared.</p></div>
        <ChevronRightIcon size={19} />
      </section>

      <section className="process-card">
        <h2>How a connection opens</h2>
        <ol className="process-list">
          <li className="complete"><span><ShieldCheckIcon size={17} /></span><div><strong>Mutual interest</strong><p>Both people choose independently.</p></div></li>
          <li className="active"><span>2</span><div><strong>Private admin review</strong><p>Eligibility and safety checks.</p></div></li>
          <li><span>3</span><div><strong>Final confirmation</strong><p>Both people choose to proceed again.</p></div></li>
          <li><span><LockIcon size={16} /></span><div><strong>Connection opens</strong><p>Only then can communication begin.</p></div></li>
        </ol>
      </section>

      <div className="quiet-note"><LockIcon size={17} /><p>Kidan will never place a name, phone number, or profile detail in a bot notification.</p></div>
    </main>
  );
}
