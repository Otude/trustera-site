import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

serve(async () => {
  try {
    const resendKey = Deno.env.get('RESEND_API_KEY')

    if (!resendKey) {
      throw new Error('RESEND_API_KEY is missing from Supabase secrets.')
    }

    const today = new Date()
    const soonDate = new Date()

    soonDate.setDate(today.getDate() + 30)

    const todayText = today.toISOString().split('T')[0]
    const soonText = soonDate.toISOString().split('T')[0]

    const { data: documents, error } = await supabase
      .from('documents')
      .select(`
        id,
        company_id,
        worker_id,
        document_type,
        expiry_date,
        workers (
          full_name,
          role,
          site
        )
      `)
      .lte('expiry_date', soonText)
      .order('expiry_date', { ascending: true })

    if (error) throw error

    const alertDocuments = documents || []

    if (alertDocuments.length === 0) {
      return Response.json({
        success: true,
        message: 'No expired or expiring documents found.',
        total: 0,
      })
    }

    const { data: admins, error: adminError } = await supabase
      .from('admin_notifications')
      .select('email')
      .eq('is_active', true)

    if (adminError) throw adminError

    const recipients = [
      ...new Set(
        (admins || [])
          .map((admin) => admin.email)
          .filter(Boolean)
      ),
    ]

    if (recipients.length === 0) {
      throw new Error('No active admin email recipients found.')
    }

    const expiredDocs = alertDocuments.filter(
      (doc) => doc.expiry_date < todayText
    )

    const expiringSoonDocs = alertDocuments.filter(
      (doc) => doc.expiry_date >= todayText
    )

    const rows = alertDocuments
      .map((doc) => {
        const status =
          doc.expiry_date < todayText ? 'Expired' : 'Expiring Soon'

        return `
          <tr>
            <td>${doc.workers?.full_name || '-'}</td>
            <td>${doc.workers?.role || '-'}</td>
            <td>${doc.workers?.site || '-'}</td>
            <td>${doc.document_type || '-'}</td>
            <td>${doc.expiry_date || '-'}</td>
            <td>${status}</td>
          </tr>
        `
      })
      .join('')

    const html = `
      <div style="font-family: Arial, sans-serif; color: #0f172a;">
        <h2>Trustera Daily Compliance Digest</h2>

        <p>
          This is your automated compliance summary for expired and expiring documents.
        </p>

        <div style="margin: 20px 0;">
          <p><strong>Expired documents:</strong> ${expiredDocs.length}</p>
          <p><strong>Expiring within 30 days:</strong> ${expiringSoonDocs.length}</p>
          <p><strong>Total alerts:</strong> ${alertDocuments.length}</p>
          <p><strong>Recipients:</strong> ${recipients.join(', ')}</p>
        </div>

        <table
          border="1"
          cellpadding="10"
          cellspacing="0"
          style="border-collapse: collapse; width: 100%;"
        >
          <thead>
            <tr style="background: #e2e8f0;">
              <th align="left">Worker</th>
              <th align="left">Role</th>
              <th align="left">Site</th>
              <th align="left">Document</th>
              <th align="left">Expiry Date</th>
              <th align="left">Status</th>
            </tr>
          </thead>

          <tbody>
            ${rows}
          </tbody>
        </table>

        <p style="margin-top: 24px; color: #64748b;">
          Sent automatically by Trustera.
        </p>
      </div>
    `

    const subject = `Trustera Compliance Digest: ${alertDocuments.length} alert(s)`

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to: recipients,
        subject,
        html,
      }),
    })

    const emailResult = await emailResponse.json()

    if (!emailResponse.ok) {
      await supabase.from('email_logs').insert([
        {
          recipient: recipients.join(', '),
          subject,
          status: 'failed',
          details: JSON.stringify(emailResult),
        },
      ])

      return Response.json(
        {
          success: false,
          message: 'Resend rejected the email request.',
          resendStatus: emailResponse.status,
          resendResult: emailResult,
          recipients,
        },
        {
          status: 500,
        }
      )
    }

    await supabase.from('email_logs').insert([
      {
        recipient: recipients.join(', '),
        subject,
        status: 'sent',
        details: JSON.stringify(emailResult),
      },
    ])

    return Response.json({
      success: true,
      message: 'Compliance email sent successfully.',
      total: alertDocuments.length,
      expired: expiredDocs.length,
      expiringSoon: expiringSoonDocs.length,
      recipients,
      resendStatus: emailResponse.status,
      resendResult: emailResult,
    })
  } catch (err) {
    return Response.json(
      {
        success: false,
        error: err.message,
      },
      {
        status: 500,
      }
    )
  }
})