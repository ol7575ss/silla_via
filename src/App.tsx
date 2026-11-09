import { useState } from 'react'
import { en } from './en'
import './App.css'

function Choices({ title, options }: { title: string; options: string[] }) {
  return <fieldset><legend>{title}</legend><div className="choices">
    {options.map(option => <label key={option}><input type="checkbox" />{option}</label>)}
  </div></fieldset>
}

export default function App() {
  const [planning, setPlanning] = useState(false)
  return <main>
    <header><strong>{en.brand}</strong><span>{en.location}</span></header>
    <section className="welcome" hidden={planning}>
      <div className="landscape" aria-hidden="true"><i /></div>
      <div className="copy"><h1>{en.title}</h1><p>{en.intro}</p>
        <button onClick={() => setPlanning(true)}>{en.start} <span aria-hidden="true">→</span></button>
      </div>
    </section>
    <section className="planner" hidden={!planning}>
      <button className="back" onClick={() => setPlanning(false)}>← {en.back}</button>
      <h1>{en.planner}</h1>
      <label>{en.origin}<input type="text" placeholder={en.placeholder} /></label>
      <div className="times">
        <label>{en.from}<input type="time" defaultValue="10:00" /></label>
        <label>{en.until}<input type="time" defaultValue="18:00" /></label>
      </div>
      <Choices title={en.interests} options={en.themes} />
      <Choices title={en.destinations} options={en.places} />
      <label className="return"><input type="checkbox" />{en.returnTrip}</label>
    </section>
  </main>
}
