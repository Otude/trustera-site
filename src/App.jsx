import { motion } from 'framer-motion';

export default function TrusteraLandingPage() {
  const features = [
    'Compliance tracking',
    'Expiry alerts',
    'Trust scoring',
    'Incident logs',
    'Attendance intelligence',
    'Audit records',
    'Multi-site dashboards',
    'Role-based access'
  ];

  const sectors = [
    'Cleaning',
    'Care Homes',
    'Security',
    'Warehousing',
    'Facilities Management',
    'Hospitality'
  ];

  const stats = [
    ['97%', 'Compliance Visibility'],
    ['42%', 'Less Admin Time'],
    ['24/7', 'Risk Monitoring']
  ];

  const plans = [
    ['Starter', '£99/mo', 'Up to 25 workers'],
    ['Growth', '£249/mo', 'Up to 100 workers'],
    ['Enterprise', 'Custom', 'Multi-site operations']
  ];

  const testimonials = [
    ['Finally one place for compliance visibility.', 'Operations Manager, Facilities Company'],
    ['Cuts admin workload dramatically.', 'Compliance Lead, Care Provider'],
    ['Exactly what shift businesses need.', 'Site Supervisor, Cleaning Contractor']
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans overflow-x-hidden pb-20 md:pb-0">
      <header className="sticky top-0 z-50 backdrop-blur-xl border-b border-slate-800/60 bg-slate-950/75">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="https://res.cloudinary.com/dmtpkpdd2/image/upload/f_auto,q_auto/logo_jj_dvjqts"
              alt="Jemadi logo"
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
            Reduce workforce risk. Automate compliance. Control operations in real-time.
          </h1>

          <p className="mt-5 md:mt-6 text-slate-300 text-base md:text-lg max-w-xl">
            Trustera helps operations teams track workforce reliability, monitor compliance,
            and manage incidents in one platform.
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <a
              href="#contact"
              className="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-2xl shadow-lg shadow-blue-600/30 inline-block"
            >
              Join Early Access
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
              ['Avg Trust Score', '84'],
              ['Expiring Docs', '3']
            ].map((card, i) => (
              <div key={i} className="bg-slate-800 rounded-2xl p-4">
                <div className="text-xs md:text-sm text-slate-400">{card[0]}</div>
                <div className="text-2xl md:text-3xl font-bold mt-2">{card[1]}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 h-24 md:h-28 rounded-2xl bg-gradient-to-r from-blue-600/20 to-cyan-400/20 border border-slate-800 flex items-end gap-2 p-3">
            {[30, 55, 45, 70, 60, 85, 78].map((h, i) => (
              <div
                key={i}
                className="flex-1 bg-blue-500/70 rounded-t-lg"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </motion.div>
      </section>

      <section className="max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-10">
        <div className="grid gap-4 md:grid-cols-3">
          {stats.map((s, i) => (
            <div
              key={i}
              className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-center"
            >
              <div className="text-3xl font-bold text-blue-300">{s[0]}</div>
              <div className="text-sm text-slate-400 mt-1">{s[1]}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="max-w-6xl mx-auto px-4 md:px-6 py-16 md:py-20">
        <h2 className="text-2xl md:text-3xl font-bold">
          Everything needed to manage workforce trust
        </h2>

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

      <section id="sectors" className="py-16 md:py-20 bg-slate-900/50">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <h2 className="text-2xl md:text-3xl font-bold">
            Built for shift-based industries
          </h2>

          <div className="grid gap-4 md:gap-5 md:grid-cols-3 mt-8">
            {sectors.map((item, i) => (
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

      <section className="max-w-6xl mx-auto px-4 md:px-6 py-16 md:py-20">
        <h2 className="text-2xl md:text-3xl font-bold text-center">
          Simple pricing for growing teams
        </h2>

        <p className="text-center text-slate-400 mt-3">
          Designed for operations-heavy businesses managing shift-based teams.
        </p>

        <div className="grid gap-5 md:grid-cols-3 mt-8 max-w-md mx-auto md:max-w-none">
          {plans.map((p, i) => (
            <div
              key={i}
              className="rounded-3xl border border-slate-800 bg-slate-900 p-6 text-center"
            >
              <div className="text-xl font-semibold">{p[0]}</div>
              <div className="text-4xl font-bold mt-4">{p[1]}</div>
              <div className="text-slate-400 mt-2">{p[2]}</div>

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

      <section className="max-w-6xl mx-auto px-4 md:px-6 py-16 md:py-20">
        <h2 className="text-2xl md:text-3xl font-bold text-center">
          Trusted by operations leaders
        </h2>

        <div className="grid gap-5 md:grid-cols-3 mt-8">
          {testimonials.map((item, i) => (
            <div
              key={i}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-5 text-slate-300"
            >
              “{item[0]}”
              <div className="mt-3 text-sm text-slate-500">{item[1]}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="contact" className="max-w-4xl mx-auto px-4 md:px-6 py-16 md:py-20 text-center">
        <h2 className="text-3xl md:text-4xl font-bold">
          Join the early access programme
        </h2>

        <p className="mt-4 text-slate-300">
          Be among the first UK businesses modernising workforce compliance, reliability, and operational risk.
        </p>

        <div className="mt-8 rounded-3xl border border-slate-800 bg-slate-900/60 backdrop-blur p-2 max-w-2xl mx-auto">
          <iframe
            src="https://tally.so/embed/XxOEvO?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1"
            width="100%"
            height="780"
            frameBorder="0"
            marginHeight="0"
            marginWidth="0"
            title="Trustera Early Access Form"
            className="rounded-2xl"
          />
        </div>

        <p className="mt-4 text-sm text-slate-500">
          Prefer email? Contact hello@jemadi.co.uk
        </p>
      </section>

      <section className="max-w-6xl mx-auto px-4 md:px-6 pb-16">
        <div className="rounded-3xl border border-slate-800 bg-gradient-to-r from-blue-600/20 to-cyan-500/10 p-8 text-center">
          <h3 className="text-2xl md:text-3xl font-bold">
            Ready to modernise workforce trust?
          </h3>

          <p className="text-slate-300 mt-3">
            Join the next generation of compliance-first operators.
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
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 text-sm text-slate-400">
          Trustera by Jemadi • Developed by Jemadi Group Ltd • hello@jemadi.co.uk • Manchester, United Kingdom
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
