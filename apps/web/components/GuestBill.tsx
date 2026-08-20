"use client";

import { useMemo, useState } from "react";
import type { PublicBillResponse } from "@fastpay/contracts";
import { Money } from "./Money";

type Mode = "bill" | "split" | "checkout" | "processing" | "success";
export function GuestBill({ bill }: { bill: PublicBillResponse }) {
  const [mode, setMode] = useState<Mode>("bill");
  const [tipAmountKopecks, setTipAmountKopecks] = useState(10000);
  const [customTip, setCustomTip] = useState(false);
  const [customTipInput, setCustomTipInput] = useState("100");
  const [selected, setSelected] = useState<string[]>([bill.order?.items[0]?.id ?? ""]);
  const items = useMemo(() => bill.order?.items ?? [], [bill.order?.items]);
  const food = useMemo(() => mode === "split" ? items.filter((item) => selected.includes(item.id)).reduce((sum, item) => sum + item.remainingKopecks, 0) : bill.order?.outstandingFoodKopecks ?? 0, [bill.order?.outstandingFoodKopecks, items, mode, selected]);
  const tipOptions = [0, 5000, 10000, 20000];
  const setPresetTip = (amountKopecks: number) => { setCustomTip(false); setTipAmountKopecks(amountKopecks); };
  const setCustomAmount = (value: string) => { setCustomTipInput(value); const amount = Number(value.replace(",", ".")); setTipAmountKopecks(Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : 0); };
  const toggle = (id: string) => setSelected((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  const startPayment = () => setMode("checkout");
  const confirmPayment = () => { setMode("processing"); window.setTimeout(() => setMode("success"), 900); };

  if (mode === "success") return <section className="screen success"><div className="success-icon" aria-hidden="true">✓</div><p className="eyebrow">ОПЛАТУ ПІДТВЕРДЖЕНО</p><h1>Дякуємо!<br />Все сплачено.</h1><Money amountKopecks={food + tipAmountKopecks} size="lg" /><p className="receipt">GOODMAN · Стіл 02 <span>Сьогодні, 15:42</span></p><div className="loyalty"><span aria-hidden="true">✦</span><p><b>Повернемо 5% наступного разу</b><small>Залиште номер після візиту</small></p><span aria-hidden="true">›</span></div><button className="secondary" onClick={() => setMode("bill")}>Переглянути рахунок</button></section>;
  if (mode === "processing") return <section className="screen processing"><div className="spinner" aria-hidden="true" /><p className="eyebrow">ПЕРЕВІРЯЄМО ОПЛАТУ</p><h1>Ще мить…</h1><p>Не закривайте цю сторінку, поки банк підтверджує платіж.</p></section>;
  if (mode === "checkout") return <section className="screen checkout"><button className="back" onClick={() => setMode("bill")} aria-label="Назад до рахунку">←</button><p className="eyebrow">БЕЗПЕЧНА ОПЛАТА</p><h1>Перевірте суму</h1><p className="subtitle">GOODMAN · Стіл {bill.table.label}</p><div className="checkout-total"><span>До сплати</span><Money amountKopecks={food + tipAmountKopecks} size="lg" /><small>Рахунок готовий до підтвердження</small></div><div className="checkout-lines"><div><span>Страви</span><Money amountKopecks={food} /></div><div><span>Чайові</span><Money amountKopecks={tipAmountKopecks} /></div></div><div className="payment-method"><span className="card-brand">••••</span><p><b>Картка, Apple Pay або Google Pay</b><small>Спосіб оплати оберете на захищеній сторінці банку</small></p><span>›</span></div><div className="checkout-safe"><span>✓</span> Дані картки не передаються ресторану</div><button className="primary full" onClick={confirmPayment}>Перейти до оплати <span>→</span></button></section>;
  const isSplit = mode === "split";
  return <section className={isSplit ? "screen split" : "screen"}>
    {isSplit ? <><button className="back" onClick={() => setMode("bill")} aria-label="Назад">←</button><p className="eyebrow">СТІЛ {bill.table.label} · {bill.venue.name}</p><h1>Що оплачуєте ви?</h1><p className="subtitle">Оберіть позиції зі спільного рахунку</p></> : <><div className="venue"><div className="venue-logo">{bill.venue.name[0]}</div><div><p className="eyebrow">ВАШ РАХУНОК</p><h1>{bill.venue.name}</h1></div><span className="table">Стіл {bill.table.label}</span></div><div className="guest-meta"><p className="live" role="status">Рахунок оновлено щойно</p><span>Захищено Rimvo</span></div></>}
    <div className={isSplit ? "choices" : "card"}><p className="label">{isSplit ? "ПОЗИЦІЇ РАХУНКУ" : "ЗАМОВЛЕННЯ"}</p>{items.map((item) => isSplit ? <button className={selected.includes(item.id) ? "choice selected" : "choice"} key={item.id} onClick={() => toggle(item.id)} aria-pressed={selected.includes(item.id)}><span className="check" aria-hidden="true">{selected.includes(item.id) ? "✓" : ""}</span><span className="name">{item.name}<small>{item.quantity} × <Money amountKopecks={item.unitPriceKopecks} /></small></span><Money amountKopecks={item.remainingKopecks} /></button> : <div className="row" key={item.id}><span className="icon" aria-hidden="true">●</span><span className="name">{item.name}<small>{item.quantity} × <Money amountKopecks={item.unitPriceKopecks} /></small></span><Money amountKopecks={item.remainingKopecks} /></div>)}{!isSplit && <><div className="rule" /><div className="sum"><span>Разом</span><Money amountKopecks={food} size="lg" /></div></>}</div>
    <div className="card tips"><div><p className="label">ЧАЙОВІ</p><b>Подякувати команді</b><small>{tipAmountKopecks ? <>Чайові: <Money amountKopecks={tipAmountKopecks} /></> : "Уся сума йде ресторану"}</small></div><div className="tip-set">{tipOptions.map((amount) => <button className={!customTip && tipAmountKopecks === amount ? "tip active" : "tip"} key={amount} onClick={() => setPresetTip(amount)}>{amount === 0 ? "Ні" : <Money amountKopecks={amount} />}</button>)}<button className={customTip ? "tip active custom-tip" : "tip custom-tip"} onClick={() => setCustomTip(true)}>Своя</button></div>{customTip && <label className="custom-tip-field">Сума чайових, ₴<input inputMode="decimal" type="number" min="0" step="1" value={customTipInput} onChange={(event) => setCustomAmount(event.target.value)} placeholder="0" autoFocus /></label>}</div>
    <div className="paybar"><div><span>{isSplit ? "Ваш рахунок" : "До сплати"}</span><Money amountKopecks={food + tipAmountKopecks} size="lg" /></div><button className="primary" disabled={!food} onClick={startPayment}>Оплатити</button></div>
    {!isSplit && <button className="link" onClick={() => setMode("split")}>Розділити рахунок →</button>}
  </section>;
}
