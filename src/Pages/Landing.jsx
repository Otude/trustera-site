import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'

import { supabase } from '../supabase'

const INITIAL_FORM_DATA = {
  name: '',
  company: '',
  email: '',
  industry: '',
  challenge: '',
}

const features = [
  'Compliance tracking',
  'Expiry alerts',
  'Audit records',
  'Document repository',
  'Compliance reports',
  'Multi-site dashboards',
  'Role-based access',
  'Document history',
]

const sectors = [
  'Security',
  'Facilities Management',
  'Cleaning',
  'Care Homes',
  'Hospitality',
  'Warehousing',
]

const benefits = [
  [
    'Never miss an expiry',
    'Track licences, right-to-work records and certifications before they become a risk.',
  ],
  [
    'Replace manual reminders',
    'Move away from spreadsheets, calendar reminders and email chasing.',
  ],
  [
    'Stay audit-ready',
    'Keep workforce compliance records visible, organised and ready for review.',
  ],
  [
    'Manage every site',
    'See compliance status across teams, roles and locations from one dashboard.',
  ],
]

const plans = [
  [
    'Early Access',
    'For teams validating workforce compliance workflows.',
  ],
  [
    'Pilot Programme',
    'For growing teams ready to test Trustera with real users.',
  ],
  [
    'Enterprise',
    'For multi-site operations needing tailored onboarding.',
  ],
]

const discoveryInsights = [
  [
    'Compliance data is often fragmented',
    'Recruitment platforms, HR systems, training portals and spreadsheets often each hold part of the compliance picture.',
  ],
  [
    'Manual tracking still survives',
    'Many teams still rely on spreadsheets, emails and calendar reminders to monitor expiries and follow-ups.',
  ],
  [
    'Audit preparation takes time',
    'When documents are spread across systems, teams spend unnecessary time gathering evidence before audits.',
  ],
]

const workflow = [
  [
    '1',
    '👤',
    'Add workers',
    'Create worker records with their role, site and current employment status.',
  ],
  [
    '2',
    '📄',
    'Upload documents',
    'Store right-to-work documents, licences, certifications, DBS checks and training records.',
  ],
  [
    '3',
    '⏰',
    'Monitor expiries',
    'Trustera tracks document status and flags expired or soon-to-expire records.',
  ],
  [
    '4',
    '🛡️',
    'Stay audit-ready',
    'Use dashboards, alerts, audit logs and reports to maintain compliance visibility.',
  ],
]

const securityFeatures = [
  'Role-based access',
  'Audit logs',
  'Secure document workflows',
  'GDPR-conscious design',
  'Document version history',
]

const dashboardStats = [
  ['Active Workers', '46'],
  ['Critical Alerts', '2'],
  ['Workers Compliant', '43 / 46'],
  ['Expiring Docs', '3'],
]

const chartValues = [30, 55, 45, 70, 60, 85, 78]

export default function TrusteraLandingPage() {
  const [formData, setFormData] = useState(INITIAL_FORM_DATA)
  const [submitting, setSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  function handleChange(event) {
    const { name, value } = event.target

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }))

    if (successMessage) {
      setSuccessMessage('')
    }

    if (errorMessage) {
      setErrorMessage('')
    }
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (submitting) return

    setSuccessMessage('')
    setErrorMessage('')

    const payload = {
      name: formData.name.trim(),
      company: formData.company.trim(),
      email: formData.email.trim().toLowerCase(),
      industry: formData.industry.trim(),
      challenge: formData.challenge.trim(),
      status: 'new',
      source: 'landing-page',
      contacted: false,
    }

    if (
      !payload.name ||
      !payload.company ||
      !payload.email ||
      !payload.industry
    ) {
      setErrorMessage('Please complete all required fields.')
      return
    }

    if (!isValidEmail(payload.email)) {
      setErrorMessage('Please enter a valid email address.')
      return
    }

    setSubmitting(true)

    try {
      const { error: leadError } = await supabase
        .from('early_access_leads')
        .insert(payload)

      if (leadError) {
        throw leadError
      }

      const { error: notificationError } =
        await supabase.functions.invoke('notify-early-access', {
          body: payload,
        })

      if (notificationError) {
        console.warn(
          'The lead was saved, but the email notification could not be sent:',
          notificationError,
        )
      }

      setSuccessMessage(
        'Thank you. Your early access request has been received.',
      )

      setFormData(INITIAL_FORM_DATA)
    } catch (error) {
      console.error('Early access submission failed:', error)

      setErrorMessage(
        'Something went wrong. Please try again or email hello@jemadi.co.uk.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-950 pb-20 font-sans text-white md:pb-0">
      <header className="sticky top-0 z-50 border-b border-slate-800/60 bg-slate-950/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <a
            href="#top"
            className="flex items-center gap-3"
            aria-label="Trustera home"
          >
            <img
              src="https://res.cloudinary.com/dmtpkpdd2/image/upload/f_auto,q_auto/logo_jj_dvjqts"
              alt="Trustera logo"
              className="h-10 w-10 rounded-xl bg-white p-1.5 shadow-lg shadow-blue-500/20 ring-1 ring-white/20 md:h-12 md:w-12"
            />

            <div>
              <div className="flex items-center gap-2 text-xl font-bold tracking-tight md:text-2xl">
                Trustera

                <span className="rounded-full border border-blue-400/20 bg-blue-500/20 px-2 py-0.5 text-[10px] text-blue-300">
                  BETA
                </span>
              </div>

              <div className="text-[10px] uppercase tracking-wide text-slate-400 md:text-xs">
                Powered by Jemadi
              </div>
            </div>
          </a>

          <div className="flex items-center gap-3">
            <nav
              className="hidden items-center gap-6 text-sm text-slate-300 lg:flex"
              aria-label="Primary navigation"
            >
              <a
                href="#features"
                className="transition hover:text-white"
              >
                Features
              </a>

              <a
                href="#workflow"
                className="transition hover:text-white"
              >
                How it works
              </a>

              <a
                href="#sectors"
                className="transition hover:text-white"
              >
                Sectors
              </a>

              <a
                href="#contact"
                className="transition hover:text-white"
              >
                Early Access
              </a>
            </nav>

            <Link
              to="/login"
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:border-blue-500 hover:bg-slate-900"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:gap-12 md:px-6 md:py-24">
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-blue-600/10 to-cyan-400/10 blur-3xl" />

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <p className="mb-3 text-sm text-blue-400">
              Built for regulated frontline teams
            </p>

            <h1 className="text-4xl font-bold leading-tight md:text-6xl">
              Reduce workforce risk. Automate compliance. Stay
              audit-ready.
            </h1>

            <p className="mt-5 max-w-xl text-base leading-7 text-slate-300 md:mt-6 md:text-lg">
              Trustera helps HR, compliance and operations teams track
              workforce documents, licence expiries and certifications
              without relying on spreadsheets or manual reminders.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <a
                href="#contact"
                className="inline-block rounded-2xl bg-blue-600 px-6 py-3 font-semibold shadow-lg shadow-blue-600/30 transition hover:bg-blue-500"
              >
                Request Early Access
              </a>

              <Link
                to="/login"
                className="inline-block rounded-2xl border border-slate-700 px-6 py-3 font-semibold transition hover:border-blue-500 hover:bg-slate-900"
              >
                Sign in
              </Link>

              <a
                href="#workflow"
                className="inline-block rounded-2xl border border-slate-700 px-6 py-3 font-semibold transition hover:border-slate-500"
              >
                See How It Works
              </a>
            </div>

            <p className="mt-5 text-sm text-slate-500">
              Already have a Trustera account?{' '}
              <Link
                to="/login"
                className="font-semibold text-blue-400 hover:text-blue-300"
              >
                Access your dashboard
              </Link>
              .
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
            className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 shadow-2xl backdrop-blur md:p-6"
          >
            <div className="grid grid-cols-2 gap-3 md:gap-4">
              {dashboardStats.map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-2xl bg-slate-800 p-4"
                >
                  <div className="text-xs text-slate-400 md:text-sm">
                    {label}
                  </div>

                  <div className="mt-2 text-2xl font-bold md:text-3xl">
                    {value}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-slate-800 bg-gradient-to-r from-blue-600/20 to-cyan-400/20 p-4">
              <div className="mb-3 text-sm text-slate-300">
                Expiring documents — next 30 days
              </div>

              <div
                className="flex h-24 items-end gap-2"
                aria-label="Example document expiry chart"
              >
                {chartValues.map((height, index) => (
                  <div
                    key={`${height}-${index}`}
                    className="flex-1 rounded-t-lg bg-blue-500/70"
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="mb-3 text-sm text-slate-400">
                Compliance alerts
              </div>

              <div className="space-y-2">
                <div className="rounded-xl border border-red-500/20 bg-red-500/15 px-3 py-2 text-sm text-red-200">
                  Driving Licence expired 2 days ago
                </div>

                <div className="rounded-xl border border-amber-500/20 bg-amber-500/15 px-3 py-2 text-sm text-amber-200">
                  SIA Licence expires in 5 days
                </div>

                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200">
                  Right to Work verified
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {benefits.map(([title, description]) => (
              <article
                key={title}
                className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"
              >
                <h2 className="text-lg font-bold text-blue-300">
                  {title}
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section
          id="features"
          className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 md:px-6 md:py-20"
        >
          <h2 className="text-2xl font-bold md:text-3xl">
            Everything needed to stay workforce compliant
          </h2>

          <p className="mt-4 max-w-3xl leading-7 text-slate-300">
            Trustera brings workforce compliance documents, expiry
            monitoring, alerts, audit records and operational visibility
            into one clear workflow.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2 md:gap-5 lg:grid-cols-4">
            {features.map((feature) => (
              <div
                key={feature}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-blue-500/40 hover:bg-slate-800"
              >
                {feature}
              </div>
            ))}
          </div>
        </section>

        <section
          id="workflow"
          className="scroll-mt-24 bg-slate-900/50 py-16 md:py-20"
        >
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <h2 className="text-2xl font-bold md:text-3xl">
              How Trustera works
            </h2>

            <p className="mt-4 max-w-3xl leading-7 text-slate-300">
              A simple workflow for turning scattered workforce
              documents into monitored, audit-ready compliance records.
            </p>

            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {workflow.map(
                ([number, icon, title, description]) => (
                  <article
                    key={number}
                    className="rounded-3xl border border-slate-800 bg-slate-950 p-6"
                  >
                    <div className="mb-5 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 font-bold">
                        {number}
                      </div>

                      <div
                        className="text-2xl"
                        aria-hidden="true"
                      >
                        {icon}
                      </div>
                    </div>

                    <h3 className="text-lg font-semibold">
                      {title}
                    </h3>

                    <p className="mt-3 text-sm leading-6 text-slate-400">
                      {description}
                    </p>
                  </article>
                ),
              )}
            </div>
          </div>
        </section>

        <section
          id="sectors"
          className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 md:px-6 md:py-20"
        >
          <h2 className="text-2xl font-bold md:text-3xl">
            Built for operationally intensive sectors
          </h2>

          <p className="mt-4 max-w-3xl leading-7 text-slate-300">
            Designed for organisations where frontline workforce
            compliance, document expiry tracking and audit readiness are
            part of daily operations.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2 md:gap-5 lg:grid-cols-3">
            {sectors.map((sector) => (
              <div
                key={sector}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-5"
              >
                {sector}
              </div>
            ))}
          </div>
        </section>

        <section className="bg-slate-900/50 py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <h2 className="text-center text-2xl font-bold md:text-3xl">
              Built from conversations with UK employers
            </h2>

            <p className="mx-auto mt-4 max-w-3xl text-center leading-7 text-slate-300">
              Trustera is being shaped through conversations with HR,
              operations, compliance, security, facilities, cleaning,
              hospitality and frontline workforce professionals across
              the UK.
            </p>

            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {discoveryInsights.map(([title, description]) => (
                <article
                  key={title}
                  className="rounded-2xl border border-slate-800 bg-slate-950 p-5"
                >
                  <h3 className="font-semibold text-white">
                    {title}
                  </h3>

                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    {description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
          <h2 className="text-center text-2xl font-bold md:text-3xl">
            Early access options for growing teams
          </h2>

          <p className="mx-auto mt-3 max-w-2xl text-center leading-7 text-slate-400">
            Designed for operations-heavy businesses managing
            regulated, shift-based teams.
          </p>

          <div className="mx-auto mt-8 grid max-w-md gap-5 md:max-w-none md:grid-cols-3">
            {plans.map(([title, description]) => (
              <article
                key={title}
                className="rounded-3xl border border-slate-800 bg-slate-900 p-6 text-center"
              >
                <h3 className="text-xl font-semibold">
                  {title}
                </h3>

                <p className="mt-4 min-h-[48px] leading-6 text-slate-400">
                  {description}
                </p>

                <a
                  href="#contact"
                  className="mt-6 inline-block w-full rounded-2xl bg-blue-600 px-4 py-3 font-semibold transition hover:bg-blue-500"
                >
                  Request Early Access
                </a>
              </article>
            ))}
          </div>
        </section>

        <section className="overflow-hidden bg-slate-900/50 py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <h2 className="text-2xl font-bold md:text-3xl">
              Built with security and accountability in mind
            </h2>

            <p className="mt-4 max-w-3xl leading-7 text-slate-300">
              Trustera is designed for sensitive workforce compliance
              information, with clear access controls, audit visibility
              and accountable system activity.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {securityFeatures.map((feature) => (
                <div
                  key={feature}
                  className="rounded-2xl border border-slate-800 bg-slate-950 p-5"
                >
                  {feature}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          id="contact"
          className="mx-auto max-w-4xl scroll-mt-24 px-4 py-16 text-center md:px-6 md:py-20"
        >
          <h2 className="text-3xl font-bold md:text-4xl">
            Join the early access programme
          </h2>

          <p className="mt-4 leading-7 text-slate-300">
            Be among the first UK businesses helping shape a modern
            workforce compliance platform.
          </p>

          <form
            onSubmit={handleSubmit}
            className="mx-auto mt-8 max-w-2xl rounded-3xl border border-slate-800 bg-slate-900/60 p-6 text-left backdrop-blur"
            noValidate
          >
            <div className="grid gap-5">
              <div>
                <label
                  htmlFor="early-access-name"
                  className="mb-2 block text-sm font-semibold"
                >
                  Name *
                </label>

                <input
                  id="early-access-name"
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  autoComplete="name"
                  disabled={submitting}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="Your name"
                />
              </div>

              <div>
                <label
                  htmlFor="early-access-company"
                  className="mb-2 block text-sm font-semibold"
                >
                  Company *
                </label>

                <input
                  id="early-access-company"
                  type="text"
                  name="company"
                  value={formData.company}
                  onChange={handleChange}
                  autoComplete="organization"
                  disabled={submitting}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="Company name"
                />
              </div>

              <div>
                <label
                  htmlFor="early-access-email"
                  className="mb-2 block text-sm font-semibold"
                >
                  Work email *
                </label>

                <input
                  id="early-access-email"
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  autoComplete="email"
                  inputMode="email"
                  disabled={submitting}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="you@company.com"
                />
              </div>

              <div>
                <label
                  htmlFor="early-access-industry"
                  className="mb-2 block text-sm font-semibold"
                >
                  Industry *
                </label>

                <select
                  id="early-access-industry"
                  name="industry"
                  value={formData.industry}
                  onChange={handleChange}
                  disabled={submitting}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">Select industry</option>
                  <option value="Security">Security</option>
                  <option value="Facilities Management">
                    Facilities Management
                  </option>
                  <option value="Cleaning">Cleaning</option>
                  <option value="Care Homes">Care Homes</option>
                  <option value="Hospitality">Hospitality</option>
                  <option value="Warehousing">Warehousing</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="early-access-challenge"
                  className="mb-2 block text-sm font-semibold"
                >
                  Biggest workforce or compliance challenge?
                </label>

                <textarea
                  id="early-access-challenge"
                  name="challenge"
                  value={formData.challenge}
                  onChange={handleChange}
                  rows={4}
                  disabled={submitting}
                  className="w-full resize-none rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="Tell us what you currently struggle with..."
                />
              </div>

              {errorMessage && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
                >
                  {errorMessage}
                </div>
              )}

              {successMessage && (
                <div
                  role="status"
                  className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"
                >
                  {successMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="rounded-2xl bg-blue-600 px-6 py-3 font-semibold shadow-lg shadow-blue-600/30 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting
                  ? 'Submitting...'
                  : 'Request Early Access'}
              </button>
            </div>
          </form>

          <p className="mt-4 text-sm text-slate-500">
            Prefer email?{' '}
            <a
              href="mailto:hello@jemadi.co.uk"
              className="text-blue-400 hover:text-blue-300"
            >
              Contact hello@jemadi.co.uk
            </a>
          </p>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 md:px-6">
          <div className="rounded-3xl border border-slate-800 bg-gradient-to-r from-blue-600/20 to-cyan-500/10 p-8 text-center">
            <h2 className="text-2xl font-bold md:text-3xl">
              Stop chasing compliance documents.
            </h2>

            <p className="mt-3 text-slate-300">
              Start managing workforce compliance from one place.
            </p>

            <div className="mt-6 flex flex-wrap justify-center gap-4">
              <a
                href="#contact"
                className="inline-block rounded-2xl bg-blue-600 px-6 py-3 font-semibold shadow-lg shadow-blue-600/30 transition hover:bg-blue-500"
              >
                Request Early Access
              </a>

              <Link
                to="/login"
                className="inline-block rounded-2xl border border-slate-700 px-6 py-3 font-semibold transition hover:border-blue-500"
              >
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-slate-400 md:flex-row md:items-center md:justify-between md:px-6">
          <div>
            <div className="font-semibold text-slate-300">
              Trustera
            </div>

            <div>
              A Jemadi product • Manchester, United Kingdom
            </div>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
            <a
              href="mailto:hello@jemadi.co.uk"
              className="transition hover:text-white"
            >
              hello@jemadi.co.uk
            </a>

            <a
              href="#contact"
              className="transition hover:text-white"
            >
              Early Access
            </a>

            <Link
              to="/login"
              className="font-semibold text-blue-400 transition hover:text-blue-300"
            >
              Sign in
            </Link>
          </div>
        </div>
      </footer>

      <div className="fixed bottom-0 left-0 z-50 w-full border-t border-slate-800 bg-slate-950 p-3 md:hidden">
        <div className="grid grid-cols-2 gap-3">
          <a
            href="#contact"
            className="block rounded-xl bg-blue-600 py-3 text-center text-sm font-semibold transition hover:bg-blue-500"
          >
            Early Access
          </a>

          <Link
            to="/login"
            className="block rounded-xl border border-slate-700 py-3 text-center text-sm font-semibold transition hover:border-blue-500"
          >
            Sign in
          </Link>
        </div>
      </div>
    </div>
  )
}