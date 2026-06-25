import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './homepage.css'

const images = [
  '/IMG_2998_Rashford.jpg',
  '/image_2.webp',
  '/image_3.jpg',
  '/image_4.jpg',
]

export default function Home() {
  const navigate = useNavigate()

  const [current, setCurrent] = useState(0)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      setFading(true)

      setTimeout(() => {
        setCurrent((prev) => (prev + 1) % images.length)
        setFading(false)
      }, 700)
    }, 6000)

    return () => clearInterval(interval)
  }, [])

  return (
    <main className="home-page">
      <div
        className={`background ${fading ? 'fade-out' : ''}`}
        style={{ backgroundImage: `url(${images[current]})` }}
      />

      <div className="home-overlay" />

      <img src="/tactixlogo.png" alt="Club logo" className="club-logo" />

      <section className="hero-content">
        <img
          src="/tactixlogowhite.png"
          alt="Tactix Football Manager"
          className="tactix-logo"
        />

        <button className="login-button" onClick={() => navigate('/login')}>
          Log in
        </button>
      </section>
    </main>
  )
}