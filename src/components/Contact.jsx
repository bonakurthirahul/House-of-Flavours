import { useRef, useState } from 'react';
import { siteConfig } from '../config.js';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { submitContactMessage } from '../lib/dbService.js';
import { Reveal } from './Reveal.jsx';
import { Phone, Mail, MapPin, Clock, ArrowRight } from './icons.jsx';

export function Contact() {
  const [form, setForm] = useState({ name: '', phone: '', email: '', message: '', company: '' });
  const [status, setStatus] = useState('idle'); // 'idle' | 'sending' | 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState('');
  // Basic spam guards: hidden honeypot field + minimum time-on-form.
  const mountedAt = useRef(Date.now());

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const name = form.name.trim();
    const phone = form.phone.trim();
    const email = form.email.trim();
    const message = form.message.trim();

    // Honeypot filled or submitted implausibly fast -> silently treat as spam.
    if (form.company.trim() || Date.now() - mountedAt.current < 1500) {
      setStatus('success');
      return;
    }
    if (!name || !message || (!phone && !email)) {
      setStatus('error');
      setErrorMsg('Please enter your name, a phone or email, and a message.');
      return;
    }
    if (!isSupabaseConfigured) {
      setStatus('error');
      setErrorMsg('Messages are temporarily unavailable. Please call us directly.');
      return;
    }

    setStatus('sending');
    try {
      await submitContactMessage({ name, phone, email, message });
      setStatus('success');
      setForm({ name: '', phone: '', email: '', message: '', company: '' });
      mountedAt.current = Date.now();
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message || 'Sorry, your message could not be sent. Please try again or call us directly.');
    }
  };

  const socialEntries = Object.entries(siteConfig.social || {}).filter(([, url]) => url);

  const INFO = [
    { label: 'Phone', value: siteConfig.phone, href: `tel:${siteConfig.phone.replace(/\s/g, '')}`, Icon: Phone },
    { label: 'Email', value: siteConfig.email, Icon: Mail },
    { label: 'Address / Service Area', value: siteConfig.address, Icon: MapPin },
    { label: 'Opening Hours', value: siteConfig.hours, Icon: Clock }
  ];

  const inputClass =
    'w-full px-4 py-3 text-sm bg-night-900 border border-gold-500/15 rounded-xl outline-none text-cream-100 placeholder:text-cream-500 focus:border-gold-500/50 transition';

  return (
    <section id="contact" className="relative scroll-mt-24 overflow-hidden">
      <div aria-hidden="true" className="absolute bottom-0 -left-24 w-96 h-96 rounded-full bg-gold-500/8 blur-[120px]" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <Reveal className="text-center max-w-2xl mx-auto">
          <span className="text-[11px] font-bold uppercase tracking-[0.28em] text-gold-400">Get in Touch</span>
          <h2 className="mt-4 font-display text-3xl sm:text-4xl xl:text-5xl font-bold tracking-tight text-cream-100">
            Let&apos;s Talk <span className="text-gradient-gold">Flavour</span>
          </h2>
          <p className="mt-4 text-sm sm:text-base text-cream-300/80">Have a question or a special request? We would love to hear from you.</p>
        </Reveal>

        <div className="mt-12 grid lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Contact info */}
          <Reveal className="space-y-4">
            {INFO.map(({ label, value, href, Icon }) => (
              <div key={label} className="glass rounded-2xl p-5 flex items-start gap-4 hover:border-gold-500/40 transition">
                <span className="w-11 h-11 rounded-xl bg-gold-500/10 border border-gold-500/25 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-gold-400" />
                </span>
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gold-400">{label}</div>
                  {href ? (
                    <a href={href} className="mt-1 block text-sm font-semibold text-cream-100 hover:text-gold-300 transition">{value}</a>
                  ) : (
                    <div className="mt-1 text-sm font-semibold text-cream-100">{value}</div>
                  )}
                </div>
              </div>
            ))}

            {socialEntries.length > 0 && (
              <div className="flex flex-wrap gap-2.5 pt-1">
                {socialEntries.map(([key, url]) => (
                  <a
                    key={key}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 rounded-full bg-night-850 border border-gold-500/15 text-xs font-semibold text-cream-300 capitalize hover:border-gold-500/50 hover:text-gold-300 transition"
                  >
                    {key}
                  </a>
                ))}
              </div>
            )}
          </Reveal>

          {/* Contact form */}
          <Reveal delay={120}>
            <form onSubmit={handleSubmit} className="glass rounded-3xl p-6 sm:p-8 space-y-4">
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                value={form.company}
                onChange={update('company')}
                className="hidden"
                name="company"
              />
              <div>
                <label className="text-[11px] font-bold text-cream-300 block mb-1.5">Name *</label>
                <input type="text" value={form.name} onChange={update('name')} placeholder="Your name" className={inputClass} />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-cream-300 block mb-1.5">Phone</label>
                  <input type="tel" value={form.phone} onChange={update('phone')} placeholder="Phone number" className={inputClass} />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-cream-300 block mb-1.5">Email</label>
                  <input type="email" value={form.email} onChange={update('email')} placeholder="Email address" className={inputClass} />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold text-cream-300 block mb-1.5">Message *</label>
                <textarea value={form.message} onChange={update('message')} rows="4" placeholder="How can we help you?" className={`${inputClass} resize-none`}></textarea>
              </div>

              {status === 'success' && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
                  Thank you! Your message has been sent successfully.
                </div>
              )}
              {status === 'error' && (
                <div className="p-3 rounded-xl bg-burgundy-600/20 border border-burgundy-400/40 text-burgundy-400 text-xs font-semibold">
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={status === 'sending'}
                className="w-full py-3.5 rounded-full bg-gradient-to-r from-gold-300 via-gold-500 to-gold-400 text-night-950 font-bold text-sm hover:brightness-110 active:scale-[0.99] transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                <ArrowRight className="w-4 h-4" />
                {status === 'sending' ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
