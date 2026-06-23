import { useNavigate } from 'react-router-dom'
import './homepage.css'

export default function Home() {
  const navigate = useNavigate();

  return (
    <main className="home-page">
      <img src="/tactixlogo.png" alt="Club logo" className="club-logo" />

      <section className="hero-content">
        <img
          src="/tactixlogowhite.png"
          alt="Tactix Football Manager"
          className="tactix-logo"
        />

        <button
          className="login-button"
          onClick={() => navigate('/login')}
        >
          Log in
        </button>
      </section>
    </main>
  );
}