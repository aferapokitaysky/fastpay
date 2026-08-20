"use client";

import { useMemo, useState } from "react";
import { demoBill } from "../lib/demo-bill";
import { Money } from "./Money";

type Mode = "bill" | "split" | "processing" | "success";
export function GuestBill() {
  const [mode, setMode] = useState<Mode>("bill");
  const [tip, setTip] = useState(10);
  const [selected, setSelected] = useState<string[]>(["burger", "lemonade"]);
  const food = useMemo(() => mode === "split" ? demoBill.items.filter((item) => selected.includes(item.id)).reduce((sum, item) => sum + item.amountKopecks, 0) : demoBill.items.reduce((sum, item) => sum + item.amountKopecks, 0), [mode, selected]);
  const tipAmount = Math.round(food * tip / 100);
  const toggle = (id: string) => setSelected((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  const startPayment = () => { setMode("processing"); window.setTimeout(() => setMode("success"), 900); };

  if (mode === "success") return <section className="screen success"><div className="success-icon" aria-hidden="true">✓</div><p className="eyebrow">ОПЛАТУ ПІДТВЕРДЖЕНО</p><h1>Дякуємо!<br />Все сплачено.</h1><Money amountKopecks={food + tipAmount} size="lg" /><p className="receipt">GOODMAN · Стіл 02 <span>Сьогодні, 15:42</span></p><div className="loyalty"><span aria-hidden="true">✦</span><p><b>Повернемо 5% наступного разу</b><small>Залиште номер після візиту</small></p><span aria-hidden="true">›</span></div><button className="secondary" onClick={() => setMode("bill")}>Переглянути рахунок</button></section>;
  if (mode === "processing") return <section className="screen processing"><div className="spinner" aria-hidden="true" /><p className="eyebrow">ПЕРЕВІРЯЄМО ОПЛАТУ</p><h1>Ще мить…</h1><p>Не закривайте цю сторінку, поки банк підтверджує платіж.</p></section>;
  const isSplit = mode === "split";
  return <section className={isSplit ? "screen split" : "screen"}>
    {isSplit ? <><button className="back" onClick={() => setMode("bill")} aria-label="Назад">←</button><p className="eyebrow">СТІЛ 02 · GOODMAN</p><h1>Що оплачуєте ви?</h1><p className="subtitle">Оберіть позиції зі спільного рахунку</p></> : <><div className="venue"><div className="venue-logo">G</div><div><p className="eyebrow">ВАШ РАХУНОК</p><h1>{demoBill.venue.name}</h1></div><span className="table">Стіл {demoBill.table.label}</span></div><p className="live" role="status">Рахунок оновлено щойно</p></>}
    <div className={isSplit ? "choices" : "card"}><p className="label">{isSplit ? "ПОЗИЦІЇ РАХУНКУ" : "ЗАМОВЛЕННЯ"}</p>{demoBill.items.map((item) => isSplit ? <button className={selected.includes(item.id) ? "choice selected" : "choice"} key={item.id} onClick={() => toggle(item.id)} aria-pressed={selected.includes(item.id)}><span className="check" aria-hidden="true">{selected.includes(item.id) ? "✓" : ""}</span><span aria-hidden="true">{item.icon}</span><span className="name">{item.name}<small>{item.detail}</small></span><Money amountKopecks={item.amountKopecks} /></button> : <div className="row" key={item.id}><span className="icon" aria-hidden="true">{item.icon}</span><span className="name">{item.name}<small>{item.detail}</small></span><Money amountKopecks={item.amountKopecks} /></div>)}{!isSplit && <><div className="rule" /><div className="sum"><span>Разом</span><Money amountKopecks={food} size="lg" /></div></>}</div>
    <div className="card tips"><div><p className="label">ЧАЙОВІ</p><b>Подякувати команді</b><small>Від суми страв</small></div><div className="tip-set">{demoBill.tipOptions.map((value) => <button className={tip === value ? "tip active" : "tip"} key={value} onClick={() => setTip(value)}>{value === 0 ? "Ні" : `${value}%`}</button>)}</div></div>
    <div className="paybar"><div><span>{isSplit ? "Ваш рахунок" : "До сплати"}</span><Money amountKopecks={food + tipAmount} size="lg" /></div><button className="primary" disabled={!food} onClick={startPayment}>Оплатити</button></div>
    {!isSplit && <button className="link" onClick={() => setMode("split")}>Розділити рахунок →</button>}
  </section>;
}
