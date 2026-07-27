import { useEffect, useMemo, useState } from 'react'
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
  {
    title: 'Never miss an expiry',
    description:
      'Track licences, right-to-work records and certifications before they become a risk.',
  },
  {
    title: 'Replace manual reminders',
    description:
      'Move away from spreadsheets, calendar reminders and email chasing.',
  },
  {
    title: 'Stay audit-ready',
    description:
      'Keep workforce compliance records visible, organised and ready for review.',
  },
  {
    title: 'Manage every site',
    description:
      'See compliance status across teams, roles and locations from one dashboard.',
  },
]

const plans = [
  {
    title: 'Early Access',
    description:
      'For teams validating workforce compliance workflows.',
  },
  {
    title: 'Pilot Programme',
    description:
      'For growing teams ready to test Trustera with real users.',
  },
  {
    title: 'Enterprise',
    description:
      'For multi-site operations needing tailored onboarding.',
  },
]

const discoveryInsights = [
  {
    title: 'Compliance data is often fragmented',
    description:
      'Recruitment platforms, HR systems, training portals and spreadsheets often each hold part of the compliance picture.',
  },
  {
    title: 'Manual tracking still survives',
    description:
      'Many teams still rely on spreadsheets, emails and calendar reminders to monitor expiries and follow-ups.',
  },
  {
    title: 'Audit preparation takes time',
    description:
      'When documents are spread across systems, teams spend unnecessary time gathering evidence before audits.',
  },
]


const comparisonItems = [
  {
    problem: 'Compliance records are spread across multiple systems',
    problemDescription:
      'Worker documents, licences, training records and expiry dates are often stored in spreadsheets, inboxes and shared folders.',
    solution: 'One central compliance workspace',
    solutionDescription:
      'Trustera brings workers, documents, expiry dates, alerts and audit activity into one structured platform.',
  },
  {
    problem: 'Teams rely on manual reminders',
    problemDescription:
      'Managers repeatedly check spreadsheets and calendars to identify documents that are about to expire.',
    solution: 'Automatic expiry monitoring',
    solutionDescription:
      'Trustera identifies expired and expiring documents and presents them clearly for timely follow-up.',
  },
  {
    problem: 'Audit preparation takes too long',
    problemDescription:
      'Evidence must often be gathered from several systems before an audit, client review or compliance check.',
    solution: 'Audit-ready records',
    solutionDescription:
      'Organised worker records, document history and activity logs improve visibility and reduce evidence-gathering time.',
  },
  {
    problem: 'Compliance ownership is unclear',
    problemDescription:
      'Teams may not know who uploaded, changed or removed important workforce records.',
    solution: 'Clear accountability',
    solutionDescription:
      'Audit logs record important administrative activity and provide a clearer trail of system actions.',
  },
]

const workflow = [
  {
    number: '1',
    icon: '👤',
    title: 'Add workers',
    description:
      'Create worker records with their role, site and current employment status.',
  },
  {
    number: '2',
    icon: '📄',
    title: 'Upload documents',
    description:
      'Store right-to-work documents, licences, certifications, DBS checks and training records.',
  },
  {
    number: '3',
    icon: '⏰',
    title: 'Monitor expiries',
    description:
      'Trustera tracks document status and flags expired or soon-to-expire records.',
  },
  {
    number: '4',
    icon: '🛡️',
    title: 'Stay audit-ready',
    description:
      'Use dashboards, alerts, audit logs and reports to maintain compliance visibility.',
  },
]

const securityFeatures = [
  'Role-based access',
  'Audit logs',
  'Secure document workflows',
  'GDPR-conscious design',
  'Document version history',
]


const roadmapItems = [
  {
    title: 'Email Reminders',
    description:
      'Scheduled email notifications for expired and soon-to-expire workforce documents.',
    status: 'Planned',
    icon: '✉',
  },
  {
    title: 'AI Compliance Assistant',
    description:
      'Assisted document review, compliance summaries and guided follow-up workflows.',
    status: 'Exploring',
    icon: '✦',
  },
  {
    title: 'Mobile Experience',
    description:
      'A mobile-friendly workflow for managers and workers accessing compliance records on the move.',
    status: 'Planned',
    icon: '▯',
  },
  {
    title: 'Advanced Compliance Reports',
    description:
      'More flexible reporting, scheduled exports and deeper compliance performance insights.',
    status: 'In development',
    icon: '▥',
  },
]

const faqItems = [
  {
    question: 'What is Trustera?',
    answer:
      'Trustera is a workforce compliance management platform designed to help organisations organise worker records, monitor document expiry dates, review alerts and maintain audit visibility.',
  },
  {
    question: 'Who is Trustera designed for?',
    answer:
      'Trustera is initially focused on UK organisations managing regulated, operational or shift-based workforces, including security, facilities management, cleaning, care, hospitality and warehousing.',
  },
  {
    question: 'Can Trustera monitor document expiry dates?',
    answer:
      'Yes. Trustera records document expiry dates and helps users identify records that are valid, expiring soon or already expired.',
  },
  {
    question: 'Can different companies see each other’s data?',
    answer:
      'No. Trustera is designed with company-level data separation so authenticated users only access records belonging to their organisation, subject to their assigned permissions.',
  },
  {
    question: 'Is Trustera available to purchase today?',
    answer:
      'Trustera is currently being developed and validated with early users. Organisations can request a demonstration or discuss participation in an early access or pilot programme.',
  },
  {
    question: 'Does Trustera replace legal or professional compliance advice?',
    answer:
      'No. Trustera helps organisations organise and monitor compliance information, but it does not replace legal advice, regulatory guidance or an organisation’s own compliance responsibilities.',
  },
]

const dashboardStats = [
  {
    label: 'Active Workers',
    value: 46,
  },
  {
    label: 'Critical Alerts',
    value: 2,
  },
  {
    label: 'Workers Compliant',
    value: 43,
    suffix: ' / 46',
  },
  {
    label: 'Expiring Docs',
    value: 3,
  },
]

const chartValues = [30, 55, 45, 70, 60, 85, 78]

const validationStats = [
  {
    value: '12+',
    label: 'Discovery conversations',
  },
  {
    value: '6',
    label: 'Operational sectors represented',
  },
  {
    value: '5',
    label: 'Core compliance workflows',
  },
  {
    value: 'UK',
    label: 'Initial market focus',
  },
]

const productScreens = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: '◫',
    eyebrow: 'Live compliance overview',
    title: 'See compliance risk at a glance',
    description:
      'Review workforce status, document validity, expiry risks and compliance performance from one central dashboard.',
    image: '/screenshots/dashboard.webp',
    alt: 'Trustera workforce compliance dashboard',
    highlights: [
      'Compliance score',
      'Workforce analytics',
      'Document status',
      'Exportable reports',
    ],
    legend: [
      { label: 'Valid', tone: 'emerald' },
      { label: 'Expiring Soon', tone: 'amber' },
      { label: 'Expired', tone: 'red' },
    ],
  },
  {
    id: 'workers',
    label: 'Workers',
    icon: '♙',
    eyebrow: 'Structured workforce records',
    title: 'Manage every worker from one place',
    description:
      'Maintain worker records, roles, sites, employment status and compliance information in a structured workflow.',
    image: '/screenshots/workers.webp',
    alt: 'Trustera worker management screen',
    highlights: [
      'Worker profiles',
      'Role and site visibility',
      'Employment status',
      'Fast search',
    ],
    legend: [
      { label: 'Active', tone: 'emerald' },
      { label: 'Inactive', tone: 'red' },
      { label: 'Profile access', tone: 'blue' },
    ],
  },
  {
    id: 'documents',
    label: 'Documents',
    icon: '▤',
    eyebrow: 'Expiry-aware document control',
    title: 'Monitor documents and expiry dates',
    description:
      'Track licences, right-to-work evidence, training records and other workforce documents before they expire.',
    image: '/screenshots/documents.webp',
    alt: 'Trustera document tracking screen',
    highlights: [
      'Secure uploads',
      'Expiry dates',
      'Document status',
      'Worker association',
    ],
    legend: [
      { label: 'Valid', tone: 'emerald' },
      { label: 'Expiring Soon', tone: 'amber' },
      { label: 'Expired', tone: 'red' },
    ],
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: '✉',
    eyebrow: 'Prioritised compliance alerts',
    title: 'Act before documents become a risk',
    description:
      'Review alerts for expired and expiring records so compliance teams can follow up promptly.',
    image: '/screenshots/notifications.webp',
    alt: 'Trustera compliance notifications screen',
    highlights: [
      'Unread alerts',
      'Severity indicators',
      'Expiry warnings',
      'Read tracking',
    ],
    legend: [
      { label: 'Unread', tone: 'blue' },
      { label: 'Expired', tone: 'red' },
      { label: 'Expiring Soon', tone: 'amber' },
      { label: 'Read', tone: 'emerald' },
    ],
  },
  {
    id: 'audit-logs',
    label: 'Audit Logs',
    icon: '☷',
    eyebrow: 'Accountability and traceability',
    title: 'Maintain a clear accountability record',
    description:
      'Review important system activity and administrative actions in an organised audit trail.',
    image: '/screenshots/audit-logs.webp',
    alt: 'Trustera audit logs screen',
    highlights: [
      'Create actions',
      'Update actions',
      'Delete actions',
      'Access events',
    ],
    legend: [
      { label: 'Create', tone: 'emerald' },
      { label: 'Update', tone: 'amber' },
      { label: 'Delete', tone: 'red' },
      { label: 'Access', tone: 'purple' },
    ],
  },
]

const PRODUCT_LEGEND_STYLES = {
  blue: 'border-blue-500/30 bg-blue-500/10 text-blue-200',
  emerald:
    'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  amber:
    'border-amber-500/30 bg-amber-500/10 text-amber-200',
  red: 'border-red-500/30 bg-red-500/10 text-red-200',
  purple:
    'border-purple-500/30 bg-purple-500/10 text-purple-200',
}

function AnimatedNumber({
  value,
  suffix = '',
  duration = 900,
}) {
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    let animationFrame
    let startTime

    function animate(timestamp) {
      if (!startTime) {
        startTime = timestamp
      }

      const progress = Math.min(
        (timestamp - startTime) / duration,
        1,
      )

      setDisplayValue(Math.round(value * progress))

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate)
      }
    }

    animationFrame = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(animationFrame)
    }
  }, [value, duration])

  return (
    <>
      {displayValue}
      {suffix}
    </>
  )
}

export default function TrusteraLandingPage() {
  const [formData, setFormData] = useState(INITIAL_FORM_DATA)
  const [submitting, setSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [activeProductScreen, setActiveProductScreen] =
    useState('dashboard')
  const [imageError, setImageError] = useState(false)
  const [openFaqIndex, setOpenFaqIndex] = useState(0)

  const selectedProductScreen = useMemo(
    () =>
      productScreens.find(
        (screen) => screen.id === activeProductScreen,
      ) || productScreens[0],
    [activeProductScreen],
  )

  useEffect(() => {
    setImageError(false)
  }, [activeProductScreen])

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
      source: 'demo-request',
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
        'Thank you. Your demo request has been received.',
      )

      setFormData(INITIAL_FORM_DATA)
    } catch (error) {
      console.error('Demo request submission failed:', error)

      setErrorMessage(
        'Something went wrong. Please try again or email hello@jemadi.co.uk.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-950 pb-24 font-sans text-white md:pb-0">
      <header className="sticky top-0 z-50 border-b border-slate-800/60 bg-slate-950/90 backdrop-blur-xl">
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
                href="#product"
                className="transition hover:text-white"
              >
                Product
              </a>

              <a
                href="#solutions"
                className="transition hover:text-white"
              >
                Solutions
              </a>

              <a
                href="#sectors"
                className="transition hover:text-white"
              >
                Sectors
              </a>

              <a
                href="#roadmap"
                className="transition hover:text-white"
              >
                Roadmap
              </a>

              <a
                href="#faq"
                className="transition hover:text-white"
              >
                FAQ
              </a>

              <a
                href="#contact"
                className="transition hover:text-white"
              >
                Book a Demo
              </a>
            </nav>

            <Link
              to="/login"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:border-blue-500 hover:bg-slate-900"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 md:grid-cols-2 md:gap-12 md:px-6 md:py-24">
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-blue-600/10 to-cyan-400/10 blur-3xl" />

          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <p className="mb-3 text-sm font-semibold text-blue-400">
              Built for regulated frontline teams
            </p>

            <h1 className="text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
              Reduce workforce risk. Automate compliance. Stay
              audit-ready.
            </h1>

            <p className="mt-6 max-w-xl text-base leading-8 text-slate-300 sm:text-lg">
              Trustera helps HR, compliance and operations teams track
              workforce documents, licence expiries and certifications
              without relying on spreadsheets or manual reminders.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <a
                href="#contact"
                className="inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-blue-600 px-6 py-3 font-semibold shadow-lg shadow-blue-600/30 transition hover:bg-blue-500 sm:w-auto"
              >
                Book a Demo
              </a>

              <a
                href="#product"
                className="inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl border border-slate-700 px-6 py-3 font-semibold transition hover:border-blue-500 hover:bg-slate-900 sm:w-auto"
              >
                See Trustera in Action
              </a>

              <Link
                to="/login"
                className="inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl border border-slate-700 px-6 py-3 font-semibold transition hover:border-slate-500 sm:w-auto"
              >
                Sign in
              </Link>
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
              {dashboardStats.map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.4,
                    delay: 0.15 + index * 0.1,
                  }}
                  className="rounded-2xl bg-slate-800 p-4"
                >
                  <div className="text-xs text-slate-400 md:text-sm">
                    {stat.label}
                  </div>

                  <div className="mt-2 text-2xl font-bold md:text-3xl">
                    <AnimatedNumber
                      value={stat.value}
                      suffix={stat.suffix}
                    />
                  </div>
                </motion.div>
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
                  <motion.div
                    key={`${height}-${index}`}
                    initial={{ height: 0 }}
                    animate={{ height: `${height}%` }}
                    transition={{
                      duration: 0.6,
                      delay: 0.4 + index * 0.08,
                      ease: 'easeOut',
                    }}
                    className="flex-1 rounded-t-lg bg-blue-500/70"
                  />
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="mb-3 text-sm text-slate-400">
                Compliance alerts
              </div>

              <div className="space-y-2">
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1 }}
                  className="rounded-xl border border-red-500/20 bg-red-500/15 px-3 py-2 text-sm text-red-200"
                >
                  Driving Licence expired 2 days ago
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1.2 }}
                  className="rounded-xl border border-amber-500/20 bg-amber-500/15 px-3 py-2 text-sm text-amber-200"
                >
                  SIA Licence expires in 5 days
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1.4 }}
                  className="rounded-xl border border-emerald-500/20 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200"
                >
                  Right to Work verified
                </motion.div>
              </div>
            </div>
          </motion.div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {validationStats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{
                  duration: 0.4,
                  delay: index * 0.08,
                }}
                className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-center"
              >
                <div className="text-3xl font-bold text-blue-400 md:text-4xl">
                  {stat.value}
                </div>

                <div className="mt-2 text-sm leading-6 text-slate-400">
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {benefits.map((benefit) => (
              <article
                key={benefit.title}
                className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6"
              >
                <h2 className="text-lg font-bold text-blue-300">
                  {benefit.title}
                </h2>

                <p className="mt-3 text-sm leading-6 text-slate-400">
                  {benefit.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section
          id="features"
          className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 md:px-6 md:py-24"
        >
          <h2 className="text-3xl font-bold md:text-4xl">
            Everything needed to stay workforce compliant
          </h2>

          <p className="mt-4 max-w-3xl leading-7 text-slate-300">
            Trustera brings workforce compliance documents, expiry
            monitoring, alerts, audit records and operational visibility
            into one clear workflow.
          </p>

          <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
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
          className="scroll-mt-24 bg-slate-900/50 py-16 md:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <h2 className="text-3xl font-bold md:text-4xl">
              How Trustera works
            </h2>

            <p className="mt-4 max-w-3xl leading-7 text-slate-300">
              A simple workflow for turning scattered workforce
              documents into monitored, audit-ready compliance records.
            </p>

            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {workflow.map((step) => (
                <article
                  key={step.number}
                  className="rounded-3xl border border-slate-800 bg-slate-950 p-6"
                >
                  <div className="mb-5 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 font-bold">
                      {step.number}
                    </div>

                    <div className="text-2xl" aria-hidden="true">
                      {step.icon}
                    </div>
                  </div>

                  <h3 className="text-lg font-semibold">
                    {step.title}
                  </h3>

                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    {step.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          id="product"
          className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 md:px-6 md:py-24"
        >
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-400">
              Inside Trustera
            </p>

            <h2 className="mt-3 text-3xl font-bold md:text-4xl">
              One platform for workforce compliance visibility
            </h2>

            <p className="mt-4 leading-7 text-slate-300">
              Explore the main Trustera workflows used to manage
              workers, documents, expiry alerts and audit activity.
            </p>
          </div>

          <div className="-mx-4 mt-10 overflow-x-auto px-4">
            <div className="flex min-w-max justify-start gap-3 md:justify-center">
              {productScreens.map((screen) => {
                const isActive =
                  screen.id === activeProductScreen

                return (
                  <button
                    key={screen.id}
                    type="button"
                    onClick={() =>
                      setActiveProductScreen(screen.id)
                    }
                    aria-pressed={isActive}
                    className={`min-h-[48px] rounded-xl px-5 py-3 text-sm font-semibold transition ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'border border-slate-700 bg-slate-900 text-slate-300 hover:border-blue-500'
                    }`}
                  >
                    <span
                      className="mr-2 text-base"
                      aria-hidden="true"
                    >
                      {screen.icon}
                    </span>

                    {screen.label}
                  </button>
                )
              })}
            </div>
          </div>

          <motion.div
            key={selectedProductScreen.id}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="mt-8 overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl"
          >
            <div className="border-b border-slate-800 p-6 md:p-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-3xl">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-400">
                    {selectedProductScreen.eyebrow}
                  </p>

                  <h3 className="mt-3 text-2xl font-bold md:text-3xl">
                    {selectedProductScreen.title}
                  </h3>

                  <p className="mt-3 leading-7 text-slate-400">
                    {selectedProductScreen.description}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:max-w-md lg:grid-cols-2">
                  {selectedProductScreen.highlights.map(
                    (highlight) => (
                      <div
                        key={highlight}
                        className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-center text-xs font-semibold text-slate-300"
                      >
                        {highlight}
                      </div>
                    ),
                  )}
                </div>
              </div>
            </div>

            <div className="bg-slate-950 p-3 md:p-6">
              {!imageError ? (
                <a
                  href={selectedProductScreen.image}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded-2xl border border-slate-800 bg-slate-950"
                  aria-label={`Open full-size ${selectedProductScreen.label} screenshot`}
                >
                  <img
                    src={selectedProductScreen.image}
                    alt={selectedProductScreen.alt}
                    loading={
                      selectedProductScreen.id === 'dashboard'
                        ? 'eager'
                        : 'lazy'
                    }
                    decoding="async"
                    fetchPriority={
                      selectedProductScreen.id === 'dashboard'
                        ? 'high'
                        : 'auto'
                    }
                    onError={() => setImageError(true)}
                    className="h-auto w-full object-contain"
                  />
                </a>
              ) : (
                <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-900 px-6 text-center text-slate-400">
                  <div>
                    <p className="font-semibold text-slate-200">
                      Screenshot unavailable
                    </p>
                    <p className="mt-2 text-sm">
                      Confirm that{' '}
                      <code className="text-blue-300">
                        {selectedProductScreen.image}
                      </code>{' '}
                      exists in the public folder.
                    </p>
                  </div>
                </div>
              )}
              {!imageError && (
                <>
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                    {selectedProductScreen.legend.map((item) => (
                      <span
                        key={`${selectedProductScreen.id}-${item.label}`}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                          PRODUCT_LEGEND_STYLES[item.tone]
                        }`}
                      >
                        <span
                          className="h-2 w-2 rounded-full bg-current"
                          aria-hidden="true"
                        />

                        {item.label}
                      </span>
                    ))}
                  </div>

                  <div className="mt-4 flex flex-col items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-center text-xs text-slate-500 sm:flex-row sm:text-left">
                    <span>
                      Product preview uses anonymised demonstration data.
                    </span>

                    <span className="font-semibold text-blue-300">
                      Select the image to open the full-resolution screen.
                    </span>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </section>

        <section
          id="solutions"
          className="scroll-mt-24 border-y border-slate-800 bg-slate-900/40 py-16 md:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-400">
                Problems and solutions
              </p>

              <h2 className="mt-3 text-3xl font-bold md:text-4xl">
                Replace fragmented compliance work with one clear workflow
              </h2>

              <p className="mt-4 leading-7 text-slate-300">
                Trustera is designed around the recurring problems raised
                by teams managing workforce documents, expiries and audit
                evidence.
              </p>
            </div>

            <div className="mt-10 grid gap-5 lg:grid-cols-2">
              {comparisonItems.map((item, index) => (
                <motion.article
                  key={item.problem}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.25 }}
                  transition={{ duration: 0.4, delay: index * 0.06 }}
                  className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950"
                >
                  <div className="border-b border-red-500/15 bg-red-500/5 p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10 text-red-300">×</div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-300">The problem</p>
                        <h3 className="mt-2 text-lg font-semibold">{item.problem}</h3>
                        <p className="mt-3 text-sm leading-6 text-slate-400">{item.problemDescription}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-emerald-500/5 p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">✓</div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">The Trustera solution</p>
                        <h3 className="mt-2 text-lg font-semibold">{item.solution}</h3>
                        <p className="mt-3 text-sm leading-6 text-slate-400">{item.solutionDescription}</p>
                      </div>
                    </div>
                  </div>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        <section
          id="sectors"
          className="scroll-mt-24 bg-slate-900/50 py-16 md:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <h2 className="text-3xl font-bold md:text-4xl">
              Built for operationally intensive sectors
            </h2>

            <p className="mt-4 max-w-3xl leading-7 text-slate-300">
              Designed for organisations where frontline workforce
              compliance, document expiry tracking and audit readiness
              are part of daily operations.
            </p>

            <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {sectors.map((sector) => (
                <div
                  key={sector}
                  className="rounded-2xl border border-slate-800 bg-slate-950 p-5"
                >
                  {sector}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-slate-800 bg-slate-900/30 py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-4 text-center md:px-6">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-400">
              Customer discovery
            </p>

            <h2 className="mt-3 text-3xl font-bold md:text-4xl">
              Built with input from UK workforce professionals
            </h2>

            <p className="mx-auto mt-4 max-w-3xl leading-7 text-slate-400">
              Trustera is being shaped through conversations with
              people responsible for workforce, compliance and
              operational records.
            </p>

            <div className="mt-7 flex flex-wrap justify-center gap-3">
              {sectors.map((sector) => (
                <div
                  key={sector}
                  className="rounded-full border border-slate-700 bg-slate-950 px-5 py-2 text-sm font-semibold text-slate-300"
                >
                  {sector}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-slate-900/50 py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <h2 className="text-center text-3xl font-bold md:text-4xl">
              What we are hearing from UK employers
            </h2>

            <p className="mx-auto mt-4 max-w-3xl text-center leading-7 text-slate-300">
              Discovery conversations continue to shape the product,
              priorities and workflows inside Trustera.
            </p>

            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {discoveryInsights.map((insight) => (
                <article
                  key={insight.title}
                  className="rounded-3xl border border-slate-800 bg-slate-950 p-6"
                >
                  <h3 className="font-semibold text-white">
                    {insight.title}
                  </h3>

                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    {insight.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
          <h2 className="text-center text-3xl font-bold md:text-4xl">
            Flexible options for growing teams
          </h2>

          <p className="mx-auto mt-3 max-w-2xl text-center leading-7 text-slate-400">
            Designed for operations-heavy businesses managing
            regulated, shift-based teams.
          </p>

          <div className="mx-auto mt-8 grid max-w-md gap-5 md:max-w-none md:grid-cols-3">
            {plans.map((plan) => (
              <article
                key={plan.title}
                className="rounded-3xl border border-slate-800 bg-slate-900 p-6 text-center"
              >
                <h3 className="text-xl font-semibold">
                  {plan.title}
                </h3>

                <p className="mt-4 min-h-[48px] leading-6 text-slate-400">
                  {plan.description}
                </p>

                <a
                  href="#contact"
                  className="mt-6 inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-blue-600 px-4 py-3 font-semibold transition hover:bg-blue-500"
                >
                  Book a Demo
                </a>
              </article>
            ))}
          </div>
        </section>

        <section className="overflow-hidden bg-slate-900/50 py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <h2 className="text-3xl font-bold md:text-4xl">
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
          id="roadmap"
          className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 md:px-6 md:py-24"
        >
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-400">Coming soon</p>
            <h2 className="mt-3 text-3xl font-bold md:text-4xl">The next stage of Trustera</h2>
            <p className="mt-4 leading-7 text-slate-300">
              These planned capabilities are being shaped by customer discovery,
              pilot feedback and the needs of operational compliance teams.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {roadmapItems.map((item, index) => (
              <motion.article
                key={item.title}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.4, delay: index * 0.08 }}
                className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 p-6"
              >
                <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-blue-500/10 blur-3xl" />
                <div className="relative">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10 text-2xl text-blue-300" aria-hidden="true">{item.icon}</div>
                    <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs font-semibold text-blue-300">{item.status}</span>
                  </div>
                  <h3 className="mt-6 text-xl font-semibold">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{item.description}</p>
                </div>
              </motion.article>
            ))}
          </div>

          <p className="mt-6 text-center text-xs leading-5 text-slate-500">
            Roadmap items are indicative and may change as Trustera continues to develop.
          </p>
        </section>

        <section
          id="faq"
          className="scroll-mt-24 border-y border-slate-800 bg-slate-900/40 py-16 md:py-24"
        >
          <div className="mx-auto max-w-4xl px-4 md:px-6">
            <div className="text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-400">Frequently asked questions</p>
              <h2 className="mt-3 text-3xl font-bold md:text-4xl">Questions about Trustera</h2>
              <p className="mx-auto mt-4 max-w-2xl leading-7 text-slate-300">
                Learn how the platform works, who it is for and what to expect during early access.
              </p>
            </div>

            <div className="mt-10 space-y-4">
              {faqItems.map((item, index) => {
                const isOpen = openFaqIndex === index
                const answerId = `faq-answer-${index}`
                const buttonId = `faq-button-${index}`

                return (
                  <article key={item.question} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
                    <h3>
                      <button
                        id={buttonId}
                        type="button"
                        onClick={() => setOpenFaqIndex(isOpen ? -1 : index)}
                        aria-expanded={isOpen}
                        aria-controls={answerId}
                        className="flex min-h-[64px] w-full items-center justify-between gap-4 px-5 py-4 text-left font-semibold transition hover:bg-slate-900 md:px-6"
                      >
                        <span>{item.question}</span>
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-700 text-blue-300 transition ${isOpen ? 'rotate-45 bg-blue-500/10' : ''}`} aria-hidden="true">+</span>
                      </button>
                    </h3>

                    {isOpen && (
                      <motion.div
                        id={answerId}
                        role="region"
                        aria-labelledby={buttonId}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        transition={{ duration: 0.25 }}
                        className="border-t border-slate-800"
                      >
                        <p className="px-5 py-5 leading-7 text-slate-400 md:px-6">{item.answer}</p>
                      </motion.div>
                    )}
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        <section
          id="contact"
          className="mx-auto max-w-4xl scroll-mt-24 px-4 py-16 text-center md:px-6 md:py-24"
        >
          <h2 className="text-3xl font-bold md:text-4xl">
            Book a Trustera demo
          </h2>

          <p className="mx-auto mt-4 max-w-2xl leading-7 text-slate-300">
            Tell us about your organisation and current compliance
            process. We will contact you to arrange a suitable
            demonstration.
          </p>

          <form
            onSubmit={handleSubmit}
            className="mx-auto mt-8 max-w-2xl rounded-3xl border border-slate-800 bg-slate-900/60 p-6 text-left backdrop-blur md:p-8"
            noValidate
          >
            <div className="grid gap-5">
              <div>
                <label
                  htmlFor="demo-name"
                  className="mb-2 block text-sm font-semibold"
                >
                  Name *
                </label>

                <input
                  id="demo-name"
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  autoComplete="name"
                  disabled={submitting}
                  className="min-h-[48px] w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-base outline-none transition focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="Your name"
                />
              </div>

              <div>
                <label
                  htmlFor="demo-company"
                  className="mb-2 block text-sm font-semibold"
                >
                  Company *
                </label>

                <input
                  id="demo-company"
                  type="text"
                  name="company"
                  value={formData.company}
                  onChange={handleChange}
                  autoComplete="organization"
                  disabled={submitting}
                  className="min-h-[48px] w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-base outline-none transition focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="Company name"
                />
              </div>

              <div>
                <label
                  htmlFor="demo-email"
                  className="mb-2 block text-sm font-semibold"
                >
                  Work email *
                </label>

                <input
                  id="demo-email"
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  autoComplete="email"
                  inputMode="email"
                  disabled={submitting}
                  className="min-h-[48px] w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-base outline-none transition focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="you@company.com"
                />
              </div>

              <div>
                <label
                  htmlFor="demo-industry"
                  className="mb-2 block text-sm font-semibold"
                >
                  Industry *
                </label>

                <select
                  id="demo-industry"
                  name="industry"
                  value={formData.industry}
                  onChange={handleChange}
                  disabled={submitting}
                  className="min-h-[48px] w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-base outline-none transition focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">Select industry</option>
                  <option value="Security">Security</option>
                  <option value="Facilities Management">
                    Facilities Management
                  </option>
                  <option value="Cleaning">Cleaning</option>
                  <option value="Care Homes">Care Homes</option>
                  <option value="Hospitality">
                    Hospitality
                  </option>
                  <option value="Warehousing">
                    Warehousing
                  </option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="demo-challenge"
                  className="mb-2 block text-sm font-semibold"
                >
                  Biggest workforce or compliance challenge?
                </label>

                <textarea
                  id="demo-challenge"
                  name="challenge"
                  value={formData.challenge}
                  onChange={handleChange}
                  rows={4}
                  disabled={submitting}
                  className="w-full resize-none rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-base outline-none transition focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
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
                className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-blue-600 px-6 py-3 font-semibold shadow-lg shadow-blue-600/30 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting
                  ? 'Submitting...'
                  : 'Request Demo'}
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
          <div className="rounded-3xl border border-slate-800 bg-gradient-to-r from-blue-600/20 to-cyan-500/10 p-8 text-center md:p-12">
            <h2 className="text-3xl font-bold md:text-4xl">
              Stop chasing compliance documents.
            </h2>

            <p className="mt-3 text-slate-300">
              Start managing workforce compliance from one place.
            </p>

            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
              <a
                href="#contact"
                className="inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-blue-600 px-6 py-3 font-semibold shadow-lg shadow-blue-600/30 transition hover:bg-blue-500 sm:w-auto"
              >
                Book a Demo
              </a>

              <a
                href="#product"
                className="inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl border border-slate-700 px-6 py-3 font-semibold transition hover:border-blue-500 sm:w-auto"
              >
                See Trustera in Action
              </a>

              <Link
                to="/login"
                className="inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl border border-slate-700 px-6 py-3 font-semibold transition hover:border-blue-500 sm:w-auto"
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
              href="#product"
              className="transition hover:text-white"
            >
              Product
            </a>

            <a
              href="#contact"
              className="transition hover:text-white"
            >
              Book a Demo
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

      <div className="fixed bottom-0 left-0 z-50 w-full border-t border-slate-800 bg-slate-950/95 p-3 backdrop-blur md:hidden">
        <div className="grid grid-cols-2 gap-3">
          <a
            href="#contact"
            className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-blue-600 px-3 py-3 text-center text-sm font-semibold transition hover:bg-blue-500"
          >
            Book a Demo
          </a>

          <Link
            to="/login"
            className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-700 px-3 py-3 text-center text-sm font-semibold transition hover:border-blue-500"
          >
            Sign in
          </Link>
        </div>
      </div>
    </div>
  )
}