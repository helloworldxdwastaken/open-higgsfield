"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
type Field = { name: string; label: string; url: string; configured: boolean };
export default function ConnectionsPage() {
  const [fields, setFields] = useState<Field[]>([]);
  const [values, setValues] = useState<Record<string,string>>({});
  const [remove, setRemove] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { fetch("/api/connections", { cache: "no-store" }).then(async response => {
    const data = await response.json(); if (!response.ok) throw new Error(data.error); setFields(data.fields);
  }).catch(() => setMessage("Could not load connections.")); }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values, remove }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setFields(data.fields); setValues({}); setRemove([]); setMessage("Connections saved. Return to the studio to generate.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save connections."); }
    finally { setSaving(false); }
  }
  return <main className="connections-page"><div className="connections-wrap">
    <Link className="connections-back" href="/en">← Studio</Link>
    <div className="connections-heading"><span className="connections-eyebrow">HIGHFIELD / CONNECTIONS</span><h1>Your providers.<br/>Your studio.</h1>
    <p>Connect only the providers you want. Cloud generation uses their APIs and credits. Local engine connections stay on your own hardware.</p></div>
    <p style={{ marginBottom: 24, color: "#b8c4a6", fontSize: 13 }}><Link href="/en/providers">Discover image, video and local engines ↗</Link></p>
    <form onSubmit={save}>
      <div className="connections-fields">{fields.map(field => <section className="connection-field" key={field.name}>
        <div className="connection-field-heading"><label htmlFor={field.name}>{field.label}</label><span className={field.configured ? "connection-status connected" : "connection-status"}>{field.configured ? "Saved" : "Not configured"}</span></div>
        {field.name === "HF_CREDENTIALS" && <p style={{ color: "#b8c4a6", fontSize: 12, lineHeight: 1.8, margin: "0 0 12px" }}>For native Genjutsu Motion Transfer, Object Swap and the optional Cinema API. Paste the complete API key copied from the provider dashboard—not browser cookies or a website session. Higgsfield API access and credits are required; another provider’s key does not unlock these exact models.</p>}
        <input id={field.name} type={field.name.endsWith("_URL") && field.name !== "CLOUDINARY_URL" ? "url" : "password"} autoComplete="new-password" spellCheck={false} value={values[field.name] || ""} placeholder={field.configured ? "Leave blank to keep saved value" : "Enter value"} onChange={event => setValues({ ...values, [field.name]: event.target.value })} />
        <div className="connection-field-footer"><a href={field.url} target="_blank" rel="noreferrer">Provider dashboard ↗</a>{field.configured && <label className="connection-remove"><input type="checkbox" checked={remove.includes(field.name)} onChange={event => setRemove(event.target.checked ? [...remove, field.name] : remove.filter(key => key !== field.name))}/> Remove saved value</label>}</div>
      </section>)}</div>
      <footer className="connections-footer"><p>Keys stay on your server. Saved values are never displayed.</p><button disabled={saving || !fields.length} type="submit">{saving ? "Saving…" : "Save connections"}</button></footer>
      <p role="status" className="connections-message">{message}</p>
    </form>
  </div></main>;
}
