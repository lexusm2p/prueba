import React, { useState, useEffect } from 'react'
import { PRODUCTS, isMini } from '../shared/menu-data'
import { toast, beep, starSfx } from '../shared/notify'
import { createOrder } from '../shared/db'
import '../shared/styles.css'

export default function Kiosko() {
  const [cart, setCart] = useState([])
  const [customerName, setCustomerName] = useState('')
  const [surprise, setSurprise] = useState('')
  const [starUnlocked, setStarUnlocked] = useState(false)

  useEffect(() => {
    starSfx.prewarm()
  }, [])

  const addToCart = (p) => {
    setCart((c) => {
      const existing = c.find((x) => x.sku === p.sku)
      if (existing) {
        return c.map((x) => x.sku === p.sku ? { ...x, qty: x.qty + 1 } : x)
      } else {
        return [...c, { sku: p.sku, name: p.name, size: p.size, price: p.price, qty: 1 }]
      }
    })
    toast(`Añadido: ${p.name}`)
    beep()
  }

  const total = cart.reduce((a,x) => a + x.price * x.qty, 0)
  const minis = cart.reduce((a,x) => a + (isMini(x) ? x.qty : 0), 0)

  useEffect(() => {
    if (!starUnlocked && minis >= 3) {
      setStarUnlocked(true)
      starSfx.play()
      toast('¡Logro desbloqueado! ⭐ Combo 3 minis')
    }
  }, [minis])

  const handleCheckout = async () => {
    if (!customerName.trim()) return toast('Escribe tu nombre…')
    if (!cart.length) return toast('Agrega productos…')
    await createOrder({
      source: 'kiosk',
      customerName,
      items: cart,
      note: '',
      surprise: surprise === 'yes',
      amount: total
    })
    toast(`¡Gracias por tu pedido, ${customerName}!`)
    beep()
    setCart([])
    setCustomerName('')
    setSurprise('')
    setStarUnlocked(false)
  }

  return (
    <div>
      <nav className="headerbar">
        <div className="inner">
          <div className="brand">🍔 Seven de Burgers — Kiosko</div>
        </div>
      </nav>
      <main>
        <div className="grid">
          <div>
            <label>Tu nombre</label>
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </div>
          <div>
            <label>¿Te sorprendemos con un aderezo?</label>
            <select value={surprise} onChange={(e) => setSurprise(e.target.value)}>
              <option value="">No, gracias</option>
              <option value="yes">Sí, sorpréndeme</option>
            </select>
          </div>
          <div>
            <button onClick={handleCheckout} className="btn">Confirmar pedido</button>
          </div>
        </div>
        <h2>Minis — Combos y sueltos</h2>
        <div className="menu">
          {PRODUCTS.filter(isMini).map((p) => (
            <div key={p.sku} className="card item">
              <div>{p.name} - ${p.price}</div>
              <button className="btn small" onClick={() => addToCart(p)}>Agregar</button>
            </div>
          ))}
        </div>
        <h2>¿Prefieres los retos grandes?</h2>
        <div className="menu">
          {PRODUCTS.filter((p) => !isMini(p)).map((p) => (
            <div key={p.sku} className="card item">
              <div>{p.name} - ${p.price}</div>
              <button className="btn small" onClick={() => addToCart(p)}>Agregar</button>
            </div>
          ))}
        </div>
      </main>
      <div className="footerbar">
        <div className="inner">
          <div>{minis} minis · {cart.length} items</div>
          <div>Total: <span className="price">${total}</span></div>
        </div>
      </div>
    </div>
  )
}
