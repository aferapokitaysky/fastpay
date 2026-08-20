import Link from "next/link";
import { RimvoLogo } from "../components/RimvoLogo";
export default function Home() { return <main className="shell"><header className="top"><RimvoLogo priority /></header><section className="screen landing"><p className="eyebrow">RIMVO · ОПЛАТА ЗА QR</p><h1>Оплата за столом без очікування термінала</h1><p>Мобільний інтерфейс для гостей, офіціантів і власників ресторанів.</p><Link className="primary-link" href="/t/demo-table-02">Відкрити гостьовий рахунок</Link><Link className="secondary-link" href="/staff">Панель офіціанта</Link></section></main>; }
