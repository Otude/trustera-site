import { motion } from 'framer-motion';

export default function TrusteraLandingPage() {
  const features = [
    'Compliance tracking',
    'Expiry alerts',
    'Audit records',
    'Document repository',
    'Compliance reports',
    'Multi-site dashboards',
    'Role-based access',
    'Document history'
  ];

  const sectors = [
    'Security',
    'Facilities Management',
    'Cleaning',
    'Care Homes',
    'Hospitality',
    'Warehousing'
  ];

  const benefits = [
    ['Never miss an expiry', 'Track licences, right-to-work records and certifications before they become a risk.'],
    ['Replace manual reminders', 'Move away from spreadsheets, calendar reminders and email chasing.'],
    ['Stay audit-ready', 'Keep workforce compliance records visible, organised and ready for review.'],
    ['Manage every site', 'See compliance status across teams, roles and locations from one dashboard.']
  ];

  const plans = [
    ['Early Access', 'For teams validating workforce compliance workflows'],
    ['Pilot Programme', 'For growing teams ready to test Trustera with real users'],
    ['Enterprise', 'For multi-site operations needing tailored onboarding']
  ];

  const discoveryInsights = [
    [
      'Compliance data is often fragmented',
      'Recruitment platforms, HR systems, training portals and spreadsheets often each hold part of the compliance picture.'
    ],
    [
      'Manual tracking still survives',
      'Many teams still rely on spreadsheets, emails and calendar reminders to monitor expiries and follow-ups.'
    ],
    [
      'Audit preparation takes time',
      'When documents are spread across systems, teams spend unnecessary time gathering evidence before audits.'
    ]
  ];

  const workflow = [
    ['1', '👤', 'Add workers', 'Create worker records with role, site and employment status.'],
    ['2', '📄', 'Upload documents', 'Store right-to-work documents, licences, certifications, DBS checks and training records.'],
    ['3', '⏰', 'Monitor expiries', 'Trustera tracks document status and flags expired or soon-to-expire records.'],
    ['4', '🛡️', 'Stay audit-ready', 'Use dashboards, alerts, audit logs and reports to maintain compliance visibility.']
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans overflow-x-hidden pb-20 md:pb-0">
      <header className="sticky top-0 z-50 backdrop-blur-xl border-b border-slate-800/60 bg-slate-950/75">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="https://res.cloudinary.com/dmtpkpdd2/image/upload/f_auto,q_auto/logo_jj_dvjqts"
              alt="Trustera logo"
              className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-white p-1.5 shadow-lg shadow-blue-500/20 ring-1 ring-white/20"
            />

            <div>
              <div className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
                Trustera
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/20">
                  BETA
                </span>
              </div>
              <div className="text-[10px] md:text-xs text-slate-400 tracking-wide uppercase">
                Powered by Jemadi
              </div>
            </div>
          </div>

          <nav className="hidden md:flex gap-6 text-sm text-slate-300">
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#workflow" className="hover:text-white">How it works</a>
            <a href="#sectors" className="hover:text-white">Sectors</a>
            <a href="#contact" className="hover:text-white">Early Access</a>
          </nav>
        </div>
      </header>

      <section className="relative max-w-6xl mx-auto px-4 md:px-6 py-16 md:py-24 grid md:grid-cols-2 gap-10 md:gap-12 items-center">
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-blue-600/10 to-cyan-400/10 blur-3xl" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
        >
          <p className="text-blue-400 text-sm mb-3">
            Built for regulated frontline teams
          </p>

          <h1 className="text-4xl md:text-6xl font-bold leading-tight">
            Reduce workforce risk. Automate compliance. Stay audit-ready.
          </h1>

          <p className="mt-5 md:mt-6 text-slate-300 text-base md:text-lg max-w-xl">
            Trustera automatically tracks workforce compliance documents,
            licence expiries and certifications — helping HR and operations
            teams stay compliant without spreadsheets or manual reminders.
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <a
              href="#contact"
              className="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-2xl shadow-lg shadow-blue-600/30 inline-block"
            >
              Join Early Access
            </a>

            <a
              href="#workflow"
              className="border border-slate-700 hover:border-slate-500 px-6 py-3 rounded-2xl inline-block"
            >
              See How It Works
            </a>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          className="bg-slate-900/80 backdrop-blur rounded-3xl p-4 md:p-6 border border-slate-800 shadow-2xl"
        >
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            {[
              ['Active Workers', '46'],
              ['Critical Alerts', '2'],
              ['Workers Compliant', '43 / 46'],
              ['Expiring Docs', '3']
            ].map((card, i) => (
              <div key={i} className="bg-slate-800 rounded-2xl p-4">
                <div className="text-xs md:text-sm text-slate-400">{card[0]}</div>
                <div className="text-2xl md:text-3xl font-bold mt-2">{card[1]}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-2xl bg-gradient-to-r from-blue-600/20 to-cyan-400/20 border border-slate-800 p-4">
            <div className="text-sm text-slate-300 mb-3">
              Expiring documents — next 30 days
            </div>
            <div className="h-24 flex items-end gap-2">
              {[30, 55, 45, 70, 60, 85, 78].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 bg-blue-500/70 rounded-t-lg"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="text-sm text-slate-400 mb-3">Compliance alerts</div>
            <div className="space-y-2">
              <div className="rounded-xl bg-red-500/15 border border-red-500/20 px-3 py-2 text-sm text-red-200">
                Driving Licence expired 2 days ago
              </div>
              <div className="rounded-xl bg-amber-500/15 border border-amber-500/20 px-3 py-2 text-sm text-amber-200">
                SIA Licence expires in 5 days
              </div>
              <div className="rounded-xl bg-emerald-500/15 border border-emerald-500/20 px-3 py-2 text-sm text-emerald-200">
                Right to Work verified
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      <section className="max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-10">
        <div className="grid gap-4 md:grid-cols-4">
          {benefits.map((item, i) => (
            <div
              key={i}
              className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"
            >
              <div className="text-lg font-bold text-blue-300">{item[0]}</div>
              <div className="text-sm text-slate-400 mt-2">{item[1]}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="max-w-6xl mx-auto px-4 md:px-6 py-16 md:py-20">
        <h2 className="text-2xl md:text-3xl font-bold">
          Everything needed to stay workforce compliant
        </h2>

        <p className="mt-4 text-slate-300 max-w-3xl">
          Trustera brings workforce compliance documents, expiry monitoring,
          alerts, audit records and operational visibility into one clear workflow.
        </p>

        <div className="grid gap-4 md:gap-5 md:grid-cols-2 lg:grid-cols-4 mt-8">
          {features.map((item, i) => (
            <div
              key={i}
              className="bg-slate-900 hover:bg-slate-800 transition border border-slate-800 rounded-2xl p-5"
            >
              {item}
            </div>
          ))}
        </div>
      </section>

      <section id="workflow" className="py-16 md:py-20 bg-slate-900/50">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <h2 className="text-2xl md:text-3xl font-bold">
            How Trustera works
          </h2>

          <p className="mt-4 text-slate-300 max-w-3xl">
            A simple workflow for turning scattered workforce documents into
            monitored, audit-ready compliance records.
          </p>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 mt-8">
            {workflow.map((step, i) => (
              <div
                key={i}
                className="rounded-3xl border border-slate-800 bg-slate-950 p-6"
              >
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold">
                    {step[0]}
                  </div>
                  <div className="text-2xl">{step[1]}</div>
                </div>

                <h3 className="text-lg font-semibold">{step[2]}</h3>
                <p className="text-sm text-slate-400 mt-3">{step[3]}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="sectors" className="max-w-6xl mx-auto px-4 md:px-6 py-16 md:py-20">
        <h2 className="text-2xl md:text-3xl font-bold">
          Built for operationally intensive sectors
        </h2>

        <p className="mt-4 text-slate-300 max-w-3xl">
          Designed for organisations where frontline workforce compliance,
          document expiry tracking and audit readiness are part of daily operations.
        </p>

        <div className="grid gap-4 md:gap-5 md:grid-cols-3 mt-8">
          {sectors.map((item, i) => (
            <div
              key={i}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-5"
            >
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="py-16 md:py-20 bg-slate-900/50">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <h2 className="text-2xl md:text-3xl font-bold text-center">
            Built from conversations with UK employers
          </h2>

          <p className="max-w-3xl mx-auto text-center text-slate-300 mt-4">
            Trustera is being shaped through conversations with HR, operations,
            compliance, security, facilities, cleaning, hospitality and frontline
            workforce professionals across the UK.
          </p>

          <div className="grid gap-5 md:grid-cols-3 mt-8">
            {discoveryInsights.map((item, i) => (
              <div
                key={i}
                className="rounded-2xl border border-slate-800 bg-slate-950 p-5"
              >
                <h3 className="font-semibold text-white">{item[0]}</h3>
                <p className="text-sm text-slate-400 mt-3">{item[1]}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 md:px-6 py-16 md:py-20">
        <h2 className="text-2xl md:text-3xl font-bold text-center">
          Early access options for growing teams
        </h2>

        <p className="text-center text-slate-400 mt-3 max-w-2xl mx-auto">
          Designed for operations-heavy businesses managing regulated,
          shift-based teams.
        </p>

        <div className="grid gap-5 md:grid-cols-3 mt-8 max-w-md mx-auto md:max-w-none">
          {plans.map((p, i) => (
            <div
              key={i}
              className="rounded-3xl border border-slate-800 bg-slate-900 p-6 text-center"
            >
              <div className="text-xl font-semibold">{p[0]}</div>
              <div className="text-slate-400 mt-4 min-h-[48px]">{p[1]}</div>

              <a
                href="#contact"
                className="mt-6 w-full bg-blue-600 hover:bg-blue-500 px-4 py-3 rounded-2xl inline-block"
              >
                Join Early Access
              </a>
            </div>
          ))}
        </div>
      </section>

      <section className="py-16 md:py-20 bg-slate-900/50 overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <h2 className="text-2xl md:text-3xl font-bold">
            Built with security and accountability in mind
          </h2>

          <p className="mt-4 text-slate-300 max-w-3xl">
            Trustera is designed for sensitive workforce compliance information,
            with clear access controls, audit visibility and accountable system
            activity.
          </p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 mt-8">
            {[
              'Role-based access',
              'Audit logs',
              'Secure document workflows',
              'GDPR-conscious design',
              'Document version history'
            ].map((item, i) => (
              <div
                key={i}
                className="rounded-2xl border border-slate-800 bg-slate-950 p-5"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="contact" className="max-w-4xl mx-auto px-4 md:px-6 py-16 md:py-20 text-center">
        <h2 className="text-3xl md:text-4xl font-bold">
          Join the early access programme
        </h2>

        <p className="mt-4 text-slate-300">
          Be among the first UK businesses helping shape a modern workforce
          compliance platform.
        </p>

        <form className="mt-8 max-w-2xl mx-auto rounded-3xl border border-slate-800 bg-slate-900/60 backdrop-blur p-6 text-left">
          <div className="grid gap-5">
            <div>
              <label className="block text-sm font-semibold mb-2">Name</label>
              <input
                type="text"
                name="name"
                className="w-full rounded-xl bg-slate-950 border border-slate-700 px-4 py-3 outline-none focus:border-blue-500"
                placeholder="Your name"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Company</label>
              <input
                type="text"
                name="company"
                className="w-full rounded-xl bg-slate-950 border border-slate-700 px-4 py-3 outline-none focus:border-blue-500"
                placeholder="Company name"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Email</label>
              <input
                type="email"
                name="email"
                className="w-full rounded-xl bg-slate-950 border border-slate-700 px-4 py-3 outline-none focus:border-blue-500"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Industry</label>
              <select
                name="industry"
                className="w-full rounded-xl bg-slate-950 border border-slate-700 px-4 py-3 outline-none focus:border-blue-500"
              >
                <option value="">Select industry</option>
                <option>Security</option>
                <option>Facilities Management</option>
                <option>Cleaning</option>
                <option>Care Homes</option>
                <option>Hospitality</option>
                <option>Warehousing</option>
                <option>Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">
                Biggest workforce/compliance challenge?
              </label>
              <textarea
                name="challenge"
                rows="4"
                className="w-full rounded-xl bg-slate-950 border border-slate-700 px-4 py-3 outline-none focus:border-blue-500 resize-none"
                placeholder="Tell us what you currently struggle with..."
              />
            </div>

            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-2xl shadow-lg shadow-blue-600/30 font-semibold"
            >
              Request Early Access
            </button>
          </div>
        </form>

        <p className="mt-4 text-sm text-slate-500">
          Prefer email? Contact hello@jemadi.co.uk
        </p>
      </section>

      <section className="max-w-6xl mx-auto px-4 md:px-6 pb-16">
        <div className="rounded-3xl border border-slate-800 bg-gradient-to-r from-blue-600/20 to-cyan-500/10 p-8 text-center">
          <h3 className="text-2xl md:text-3xl font-bold">
            Stop chasing compliance documents.
          </h3>

          <p className="text-slate-300 mt-3">
            Start managing workforce compliance from one place.
          </p>

          <a
            href="#contact"
            className="mt-6 bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-2xl shadow-lg shadow-blue-600/30 inline-block"
          >
            Join Early Access
          </a>
        </div>
      </section>

      <footer className="border-t border-slate-800">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 text-sm text-slate-400 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div>
            <div className="text-slate-300 font-semibold">Trustera</div>
            <div>A Jemadi product • Manchester, United Kingdom</div>
          </div>

          <div className="flex flex-col md:flex-row gap-2 md:gap-4">
            <a href="mailto:hello@jemadi.co.uk" className="hover:text-white">
              hello@jemadi.co.uk
            </a>
            <a href="#contact" className="hover:text-white">
              Early Access
            </a>
          </div>
        </div>
      </footer>

      <div className="fixed bottom-0 left-0 w-full md:hidden bg-slate-950 border-t border-slate-800 p-3 z-50">
        <a
          href="#contact"
          className="block w-full text-center bg-blue-600 hover:bg-blue-500 py-3 rounded-xl font-semibold"
        >
          Join Early Access
        </a>
      </div>
    </div>
  );
}
