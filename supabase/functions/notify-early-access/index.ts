const allowedOrigins = new Set([
  "https://trust.jemadi.co.uk",
  "http://localhost:5173",
  "http://localhost:4173",
]);

type DemoRequestPayload = {
  name?: string;
  company?: string;
  email?: string;
  industry?: string;
  challenge?: string;
  source?: string;
};

function getCorsHeaders(request: Request) {
  const requestOrigin = request.headers.get("origin") ?? "";

  const allowedOrigin = allowedOrigins.has(requestOrigin)
    ? requestOrigin
    : "https://trust.jemadi.co.uk";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonResponse(
  request: Request,
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(request),
      "Content-Type": "application/json",
    },
  });
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function sendResendEmail({
  apiKey,
  from,
  to,
  subject,
  html,
  replyTo,
}: {
  apiKey: string;
  from: string;
  to: string[];
  subject: string;
  html: string;
  replyTo?: string;
}) {
  const response = await fetch(
    "https://api.resend.com/emails",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        html,
        ...(replyTo
          ? {
              reply_to: replyTo,
            }
          : {}),
      }),
    },
  );

  const responseText = await response.text();

  let responseBody: Record<string, unknown>;

  try {
    responseBody = JSON.parse(responseText);
  } catch {
    responseBody = {
      message: responseText || "Unknown Resend response",
    };
  }

  console.log("Resend response:", {
    status: response.status,
    ok: response.ok,
    id: responseBody?.id ?? null,
  });

  if (!response.ok) {
    console.error("Resend rejected the email:", responseBody);

    throw new Error(
      String(
        responseBody?.message ||
          `Resend returned HTTP ${response.status}.`,
      ),
    );
  }

  return responseBody;
}

Deno.serve(async (request) => {
  const corsHeaders = getCorsHeaders(request);

  if (request.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      request,
      {
        success: false,
        error: "Method not allowed.",
      },
      405,
    );
  }

  try {
    const requestOrigin =
      request.headers.get("origin") ?? "no-origin";

    console.log("Demo function invoked:", {
      method: request.method,
      origin: requestOrigin,
    });

    const body =
      (await request.json()) as DemoRequestPayload;

    const name = body.name?.trim() ?? "";
    const company = body.company?.trim() ?? "";
    const email =
      body.email?.trim().toLowerCase() ?? "";
    const industry = body.industry?.trim() ?? "";
    const challenge =
      body.challenge?.trim() || "Not provided";
    const source =
      body.source?.trim() || "demo-request";

    if (!name || !company || !email || !industry) {
      return jsonResponse(
        request,
        {
          success: false,
          error:
            "Name, company, email and industry are required.",
        },
        400,
      );
    }

    if (!isValidEmail(email)) {
      return jsonResponse(
        request,
        {
          success: false,
          error: "A valid email address is required.",
        },
        400,
      );
    }

    const resendApiKey =
      Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      console.error(
        "RESEND_API_KEY is missing from Supabase secrets.",
      );

      return jsonResponse(
        request,
        {
          success: false,
          error:
            "The email service is not configured.",
        },
        500,
      );
    }

    console.log("Valid demo request received:", {
      company,
      industry,
      source,
      hasEmail: Boolean(email),
    });

    const sender =
      "Trustera <hello@trust.jemadi.co.uk>";

    const adminRecipients = [
      "amadiemmanuelotude@gmail.com",
      "hello@jemadi.co.uk",
    ];

    const adminResult = await sendResendEmail({
      apiKey: resendApiKey,
      from: sender,
      to: adminRecipients,
      replyTo: email,
      subject: `New Trustera demo request – ${company}`,
      html: `
        <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.7; color: #111827; max-width: 680px; margin: 0 auto;">
          <h2 style="color: #0f172a;">
            New Trustera demo request
          </h2>

          <p>
            A new demo request has been submitted through the Trustera website.
          </p>

          <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;">

          <p>
            <strong>Name:</strong>
            ${escapeHtml(name)}
          </p>

          <p>
            <strong>Company:</strong>
            ${escapeHtml(company)}
          </p>

          <p>
            <strong>Email:</strong>
            <a href="mailto:${escapeHtml(email)}">
              ${escapeHtml(email)}
            </a>
          </p>

          <p>
            <strong>Industry:</strong>
            ${escapeHtml(industry)}
          </p>

          <p>
            <strong>Source:</strong>
            ${escapeHtml(source)}
          </p>

          <p>
            <strong>Workforce or compliance challenge:</strong>
          </p>

          <p>
            ${escapeHtml(challenge)}
          </p>
        </div>
      `,
    });

    console.log("Admin notification accepted:", {
      id: adminResult?.id ?? null,
    });

    const visitorResult = await sendResendEmail({
      apiKey: resendApiKey,
      from: sender,
      to: [email],
      replyTo: "hello@jemadi.co.uk",
      subject: "Your Trustera demo request has been received",
      html: `
        <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.7; color: #111827; max-width: 680px; margin: 0 auto;">
          <h2 style="color: #0f172a;">
            Thank you for requesting a Trustera demo
          </h2>

          <p>
            Hello ${escapeHtml(name)},
          </p>

          <p>
            We have successfully received your Trustera demo request.
          </p>

          <p>
            Our team will review the information you provided and contact you shortly to arrange a suitable demonstration.
          </p>

          <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;">

          <h3 style="color: #0f172a;">
            Your submission
          </h3>

          <p>
            <strong>Company:</strong>
            ${escapeHtml(company)}
          </p>

          <p>
            <strong>Industry:</strong>
            ${escapeHtml(industry)}
          </p>

          <p>
            <strong>Your main challenge:</strong>
          </p>

          <p>
            ${escapeHtml(challenge)}
          </p>

          <p style="margin-top: 30px;">
            In the meantime, you can reply directly to this email if you have any questions.
          </p>

          <p>
            Kind regards,<br>
            <strong>The Trustera Team</strong><br>
            <a href="https://trust.jemadi.co.uk">
              trust.jemadi.co.uk
            </a>
          </p>
        </div>
      `,
    });

    console.log("Visitor confirmation accepted:", {
      id: visitorResult?.id ?? null,
    });

    return jsonResponse(
      request,
      {
        success: true,
        adminEmailId: adminResult?.id ?? null,
        visitorEmailId: visitorResult?.id ?? null,
      },
      200,
    );
  } catch (error) {
    console.error(
      "notify-early-access failed:",
      error,
    );

    return jsonResponse(
      request,
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Email notification failed.",
      },
      500,
    );
  }
});