import { Link } from 'react-router-dom'
import { NOTUS_CONTACT_EMAIL } from '../AppCompanyPages'

/**
 * Full Privacy Policy body (in-app). Structured for B2B SaaS collaboration products.
 */
export function LegalPrivacyPolicySections() {
  return (
    <>
      <section className="app-legal-block" aria-labelledby="priv-intro">
        <h2 id="priv-intro">1. Introduction and scope</h2>
        <p>
          This Privacy Policy describes how Notus (&quot;Notus,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;)
          collects, uses, discloses, stores, and otherwise processes personal data when you access or use our websites,
          web applications, APIs, desktop or mobile clients that link to this policy, and related online services
          (collectively, the &quot;Services&quot;). It also explains your choices and rights regarding personal data,
          subject to applicable law.
        </p>
        <p>
          By using the Services, you acknowledge that you have read this Privacy Policy. If you do not agree, you must
          not use the Services. Where we process personal data on behalf of an organization that subscribes to Notus
          (your &quot;Organization&quot;), that Organization may also impose additional privacy rules through its
          internal policies, employment agreements, or enterprise agreement with Notus. In such cases, this Privacy
          Policy applies alongside those rules, and the Organization may act as an independent controller for certain
          employee or workforce data.
        </p>
        <p>
          This policy does not apply to third-party websites, applications, or services that are linked from the
          Services or integrated via your Organization&apos;s configuration. Those third parties maintain their own
          privacy notices, which we encourage you to review.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="priv-defs">
        <h2 id="priv-defs">2. Definitions</h2>
        <p>For clarity, the following terms have the meanings below unless the context requires otherwise:</p>
        <ul>
          <li>
            <strong>Personal data</strong> means information that identifies or relates to an identified or identifiable
            individual, or that is otherwise treated as &quot;personal information,&quot; &quot;personally identifiable
            information,&quot; or similar terms under applicable privacy laws.
          </li>
          <li>
            <strong>Customer</strong> means the legal entity (for example, your employer or client) that enters into an
            agreement with Notus to use the Services for its workforce or end users.
          </li>
          <li>
            <strong>Customer content</strong> means files, messages, meeting recordings or transcripts (where enabled),
            calendar entries, notes, profile fields, and other materials that users submit to or generate within the
            Services, excluding aggregated or de-identified analytics derived by Notus in accordance with this policy.
          </li>
          <li>
            <strong>Processor / service provider</strong> means a vendor that processes personal data on our behalf
            subject to contractual safeguards.
          </li>
        </ul>
      </section>

      <section className="app-legal-block" aria-labelledby="priv-roles">
        <h2 id="priv-roles">3. Roles: controller, processor, and enterprise arrangements</h2>
        <p>
          Depending on the context, Notus may act as a <strong>controller</strong> of personal data (for example,
          account registration data, billing contacts, website visitors, security logs used for our own compliance) or
          as a <strong>processor</strong> on behalf of a Customer (for example, when hosting Organization workspaces,
          channel messages, and meeting metadata that the Customer instructs us to process).
        </p>
        <p>
          Where Notus processes personal data as a processor, the Customer is typically the controller (or another
          entity designated in the Customer&apos;s agreement) and determines the purposes and means of processing for
          that workspace data. Our data processing terms, including standard contractual clauses or other transfer
          mechanisms where required, are incorporated by reference in the Customer&apos;s subscription agreement or Data
          Processing Addendum (&quot;DPA&quot;), when applicable.
        </p>
        <p>
          If you interact with Notus only as an individual consumer (for example, signing up for a personal trial not
          tied to an Organization), Notus is generally the controller of the personal data described in this policy for
          those interactions.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="priv-collect">
        <h2 id="priv-collect">4. Personal data we collect</h2>
        <p>
          We collect personal data that you provide directly, that we receive automatically when you use the Services,
          and that we obtain from third parties as described below. The categories depend on how you use Notus and which
          features your Organization enables.
        </p>

        <h3>4.1 Account and identity data</h3>
        <p>
          Name, display name, email address, username or user identifier, profile photograph, job title or role (if
          provided), phone number, time zone, language preferences, authentication factors, session tokens, and
          identifiers issued by identity providers when you use single sign-on or social login where supported.
        </p>

        <h3>4.2 Organization and workspace data</h3>
        <p>
          Organization name, subdomain or workspace identifier, billing and shipping addresses, tax identifiers where
          required, administrator contact details, team or channel names, membership lists, invitation records, audit
          events related to access and administrative actions (where logged), and configuration settings that your
          administrators apply (for example, retention policies, feature toggles, integration settings).
        </p>

        <h3>4.3 Communications and collaboration content</h3>
        <p>
          Messages, posts, reactions, attachments, shared links, collaborative documents, comments, meeting titles and
          descriptions, participant lists, dial-in or join information, lobby or waiting-room status, hand-raise or
          similar signaling metadata, chat within meetings, and exports you initiate. Where your Organization enables
          transcription, captioning, or AI-assisted summaries, we process audio, text derived from audio, and related
          timestamps and speaker labels as instructed by the Customer and subject to workspace settings.
        </p>

        <h3>4.4 Calendar and scheduling data</h3>
        <p>
          Event titles, descriptions, locations, attendee responses, recurrence rules, visibility settings, reminders,
          and integration tokens or identifiers when you connect external calendars. We process this data to display
          schedules, prevent conflicts, and deliver notifications you or your Organization configure.
        </p>

        <h3>4.5 Technical, usage, and device data</h3>
        <p>
          IP address, approximate geographic location derived from IP, browser type and version, operating system,
          device type, device identifiers where available, network connection type, referring URL, pages or screens
          viewed, clicks and taps, feature usage frequency, crash diagnostics, performance metrics, error logs, and
          security telemetry (for example, failed login attempts, rate-limit events, and anomaly indicators). We use this
          information to operate, secure, debug, and improve the Services.
        </p>

        <h3>4.6 Support, sales, and marketing data</h3>
        <p>
          Information you provide when you contact us (for example, via web forms or email), including the content of
          your message and attachments, call recordings if you consent to recording, and satisfaction survey responses.
          If you receive marketing communications where permitted by law, we maintain subscription preferences,
          unsubscribe requests, and engagement metrics.
        </p>

        <h3>4.7 Payment and billing data</h3>
        <p>
          Billing contact name, email, billing address, purchase history, plan tier, tax status, and payment transaction
          references. Payment card numbers and bank account details are generally collected and stored by our payment
          service providers; we receive limited tokenized or non-sensitive confirmation data necessary to reconcile
          transactions.
        </p>

        <h3>4.8 Information we do not intend to collect</h3>
        <p>
          We do not knowingly direct the Services to children under 16 (or the age required in your jurisdiction) and do
          not knowingly collect personal data from children for marketing purposes. If you believe we have collected
          information from a child in violation of law, contact us using the details in Section 20.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="priv-sources">
        <h2 id="priv-sources">5. Sources of personal data</h2>
        <p>We obtain personal data from the following categories of sources:</p>
        <ul>
          <li>
            <strong>You</strong>, when you register, complete your profile, invite colleagues, participate in meetings,
            send messages, upload files, configure settings, or communicate with us.
          </li>
          <li>
            <strong>Your Organization</strong>, when administrators provision accounts, assign roles, import directory
            information, or connect integrations.
          </li>
          <li>
            <strong>Other users</strong>, when they mention you, invite you, share content with you, or add you to teams
            or channels.
          </li>
          <li>
            <strong>Service providers and subprocessors</strong>, such as hosting, authentication, email delivery,
            analytics (where enabled), payment processors, and real-time communications infrastructure, which may
            provide us with delivery confirmations, fraud signals, or infrastructure logs.
          </li>
          <li>
            <strong>Public or third-party sources</strong>, in limited circumstances, such as company information
            associated with your email domain for account verification or risk assessment, where permitted by law.
          </li>
        </ul>
      </section>

      <section className="app-legal-block" aria-labelledby="priv-use">
        <h2 id="priv-use">6. Purposes of processing and legal bases (where applicable)</h2>
        <p>
          Where the EU or UK General Data Protection Regulation or similar laws apply, we rely on one or more of the
          following legal bases: performance of a contract, legitimate interests (where not overridden by your rights),
          consent where required, compliance with legal obligations, and, in limited cases, vital interests or public
          interest tasks. The table below summarizes primary purposes; your agreement with us or your Organization may
          specify additional instructions for workspace data processed as a processor.
        </p>
        <div className="app-legal-table-wrap">
          <table className="app-legal-table">
            <thead>
              <tr>
                <th>Purpose</th>
                <th>Examples</th>
                <th>Typical legal basis (EEA/UK)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Provide and operate the Services</td>
                <td>Authentication, routing requests, delivering messages, hosting meetings, storing Customer content</td>
                <td>Contract; legitimate interests</td>
              </tr>
              <tr>
                <td>Security and abuse prevention</td>
                <td>Fraud detection, rate limiting, malware scanning, investigating violations of our terms</td>
                <td>Legitimate interests; legal obligation</td>
              </tr>
              <tr>
                <td>Improvement and analytics</td>
                <td>Aggregated product analytics, A/B testing, quality metrics, feature planning</td>
                <td>Legitimate interests; consent where required</td>
              </tr>
              <tr>
                <td>Customer support</td>
                <td>Troubleshooting, responding to inquiries, training (with appropriate safeguards)</td>
                <td>Contract; legitimate interests</td>
              </tr>
              <tr>
                <td>Billing and administration</td>
                <td>Invoicing, tax, account management, enterprise procurement workflows</td>
                <td>Contract; legal obligation</td>
              </tr>
              <tr>
                <td>Marketing</td>
                <td>Sending product updates or events where permitted; preference management</td>
                <td>Consent or legitimate interests, as applicable</td>
              </tr>
              <tr>
                <td>Legal compliance</td>
                <td>Responding to lawful requests, preserving records, enforcing terms</td>
                <td>Legal obligation; legitimate interests</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="app-legal-block" aria-labelledby="priv-ai">
        <h2 id="priv-ai">7. Artificial intelligence and automated features</h2>
        <p>
          Certain features may use machine learning or other automated techniques to generate summaries, suggest
          responses, transcribe speech, detect spam or abuse, or organize content. Unless we notify you otherwise, such
          processing is performed to deliver functionality your Organization enables and is subject to technical and
          organizational measures designed to protect confidentiality and integrity.
        </p>
        <p>
          We do not use Customer content to train generalized public models for unrelated products unless we have
          obtained appropriate permission in your agreement or through a separate, explicit consent or configuration
          controlled by the Customer. Where required by law, we will provide information about logic involved and
          significance of automated processing.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="priv-share">
        <h2 id="priv-share">8. Disclosure of personal data</h2>
        <p>We may disclose personal data to the following categories of recipients:</p>
        <ul>
          <li>
            <strong>Vendors and subprocessors</strong> who provide infrastructure, communications, security, analytics,
            payment processing, customer relationship management, and professional services, bound by written agreements
            requiring appropriate confidentiality and security obligations.
          </li>
          <li>
            <strong>Your Organization</strong>, including administrators who can access workspace administration tools,
            audit logs, and content visibility consistent with their role and your Organization&apos;s policies.
          </li>
          <li>
            <strong>Professional advisers</strong>, such as lawyers, accountants, and insurers, where necessary and
            subject to confidentiality duties.
          </li>
          <li>
            <strong>Corporate transactions</strong>, such as a merger, acquisition, financing, or sale of assets, where
            personal data may be transferred as a business asset subject to safeguards.
          </li>
          <li>
            <strong>Law enforcement and regulators</strong>, when we believe disclosure is required to comply with law,
            regulation, legal process, or governmental request, or to protect the rights, property, or safety of Notus,
            our users, or the public, as permitted by law.
          </li>
        </ul>
        <p>
          We do not sell personal data as that term is defined under the California Consumer Privacy Act, as amended
          (&quot;CCPA&quot;), and we do not share personal data for cross-context behavioral advertising as a
          &quot;sale&quot; or &quot;sharing&quot; under the CCPA unless we provide a separate notice and opt-out
          mechanism where required.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="priv-retention">
        <h2 id="priv-retention">9. Retention</h2>
        <p>
          We retain personal data for as long as necessary to fulfill the purposes described in this policy, unless a
          longer retention period is required or permitted by law. Retention criteria include: whether you maintain an
          active account; whether the data is needed to provide the Services; whether the Customer has configured
          retention or deletion rules; whether we must resolve disputes or enforce agreements; and whether we have
          legal, tax, or regulatory obligations to retain records.
        </p>
        <p>
          When personal data is no longer needed, we delete or de-identify it in accordance with our internal schedules
          and technical capabilities. Some residual copies may persist in encrypted backups for a limited period before
          being overwritten.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="priv-security">
        <h2 id="priv-security">10. Security</h2>
        <p>
          We implement administrative, technical, and physical safeguards designed to protect personal data against
          unauthorized access, loss, or alteration. Measures may include encryption in transit, access controls,
          logging, vulnerability management, and employee training. No method of transmission or storage is completely
          secure; you should use strong passwords, enable multi-factor authentication where available, and follow your
          Organization&apos;s security policies. Additional detail is available in our{' '}
          <Link to="/app/security">Security</Link> overview.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="priv-transfers">
        <h2 id="priv-transfers">11. International transfers</h2>
        <p>
          Notus may process and store personal data in the United States and in other countries where we or our
          subprocessors operate. If we transfer personal data from the EEA, UK, Switzerland, or other regions with
          transfer restrictions, we implement appropriate safeguards such as Standard Contractual Clauses approved by the
          European Commission, the UK International Data Transfer Addendum, or other lawful mechanisms, together with
          supplementary measures where required by regulators.
        </p>
        <p>
          Customers may request a copy of our then-current list of subprocessors and applicable transfer documentation
          through their account representative or <Link to="/app/contact">Contact</Link>.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="priv-rights">
        <h2 id="priv-rights">12. Your privacy rights</h2>
        <p>
          Depending on your location, you may have rights to access, correct, delete, port, or restrict processing of
          your personal data, to object to certain processing, to withdraw consent where processing is based on
          consent, and to lodge a complaint with a supervisory authority. Organizations using Notus may route certain
          requests through their administrators for workspace data we process as a processor.
        </p>
        <p>
          To exercise rights, contact us at{' '}
          <a href={`mailto:${NOTUS_CONTACT_EMAIL}`}>{NOTUS_CONTACT_EMAIL}</a> or use{' '}
          <Link to="/app/contact">Contact</Link>. We may need to verify your identity before fulfilling a request. We
          will respond within the timeframe required by applicable law.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="priv-us-states">
        <h2 id="priv-us-states">13. United States state privacy notices</h2>
        <p>
          Residents of certain U.S. states may have additional rights regarding personal information, including rights
          to know, delete, correct, opt out of certain processing (such as targeted advertising or profiling in some
          jurisdictions), and appeal our decisions. We honor applicable rights requests as required by law. You may
          designate an authorized agent where permitted; we may require proof of authorization.
        </p>
        <p>
          We do not discriminate against individuals for exercising privacy rights. Financial incentives, if ever
          offered in connection with personal information, will be described in a separate notice with instructions
          to opt in or out as required.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="priv-cookies">
        <h2 id="priv-cookies">14. Cookies and similar technologies</h2>
        <p>
          We use cookies, local storage, session storage, pixels, and similar technologies for authentication, preferences,
          security, and, where permitted, analytics. For category-specific information and controls, see our{' '}
          <Link to="/app/cookies">Cookie Policy</Link>.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="priv-changes">
        <h2 id="priv-changes">15. Changes to this Privacy Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will post the revised version in the Services and
          update the effective date. If changes materially affect your rights, we will provide additional notice as
          required by law (for example, email or in-product notification). Your continued use of the Services after the
          effective date constitutes acceptance of the updated policy, except where your consent is required.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="priv-contact">
        <h2 id="priv-contact">16. Contact</h2>
        <p>
          For privacy questions or requests: <a href={`mailto:${NOTUS_CONTACT_EMAIL}`}>{NOTUS_CONTACT_EMAIL}</a> or{' '}
          <Link to="/app/contact">Contact</Link>. If you are located in the EEA, UK, or Switzerland and we have appointed
          a representative or data protection contact for your region, that information will be provided in your
          enterprise agreement or order documentation.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="priv-subprocessors">
        <h2 id="priv-subprocessors">17. Subprocessors and service categories</h2>
        <p>
          We engage carefully vetted service providers to host data, deliver notifications, process payments, operate
          real-time audio and video infrastructure, perform security monitoring, and support internal business
          functions. Subprocessors are contractually required to process personal data only on documented instructions
          (when acting as processors), to implement appropriate security measures, and to assist with data subject
          requests and breach notification obligations to the extent applicable.
        </p>
        <p>
          The following table describes representative categories. Specific vendor names, locations, and functions may
          be listed in a Customer-facing subprocessor appendix or updated through the notification process in your
          agreement.
        </p>
        <div className="app-legal-table-wrap">
          <table className="app-legal-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Role</th>
                <th>Typical data elements</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Cloud infrastructure and database</td>
                <td>Hosting, storage, backups, key management</td>
                <td>Customer content, account metadata, logs</td>
              </tr>
              <tr>
                <td>Identity and access</td>
                <td>Authentication, session management, fraud signals</td>
                <td>Identifiers, IP address, device signals</td>
              </tr>
              <tr>
                <td>Real-time communications</td>
                <td>Media routing, quality metrics</td>
                <td>Ephemeral media streams; limited metadata</td>
              </tr>
              <tr>
                <td>Email and in-product messaging</td>
                <td>Transactional mail, invitations</td>
                <td>Email address, name, invitation context</td>
              </tr>
              <tr>
                <td>Payment processing</td>
                <td>Billing, tax, invoicing</td>
                <td>Billing contact, transaction references</td>
              </tr>
              <tr>
                <td>Support tooling</td>
                <td>Ticketing, diagnostics</td>
                <td>Contact details, case content you provide</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="app-legal-block" aria-labelledby="priv-meetings">
        <h2 id="priv-meetings">18. Meetings, recordings, transcripts, and AI-assisted features</h2>
        <p>
          When you join a meeting, we process technical identifiers, connection quality data, and, depending on
          configuration, audio and video streams to deliver the session. If recording, live transcription, captioning,
          or AI-generated summaries are enabled, additional voice and text data may be processed and stored according to
          workspace policies and in-meeting notices presented to participants.
        </p>
        <p>
          You should obtain any legally required consents before recording others, and you should inform participants
          when AI features analyze meeting content. Organizations are responsible for configuring lawful bases and
          internal policies for workforce monitoring where applicable. Notus provides administrative controls intended
          to help Customers limit access to recap materials; Customers remain responsible for classification and access
          rules for sensitive discussions (for example, human resources or health-related topics).
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="priv-admin">
        <h2 id="priv-admin">19. Administrator access and auditability</h2>
        <p>
          Organization administrators may be able to view membership, reset access, export certain data, configure
          integrations, and review security-relevant events depending on product capabilities and the Customer&apos;s
          subscription. Administrators act under the Customer&apos;s direction. If you have questions about how your
          Organization uses administrative tools, contact your internal IT or legal team.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="priv-breach">
        <h2 id="priv-breach">20. Personal data breaches</h2>
        <p>
          We maintain incident response procedures designed to detect, contain, and remediate suspected unauthorized
          access to systems processing personal data. Where we act as a processor, we will notify the Customer without
          undue delay after becoming aware of a breach affecting Customer personal data, in accordance with the DPA.
          Where we act as a controller, we will notify affected individuals and regulators when required by law.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="priv-deidentified">
        <h2 id="priv-deidentified">21. Aggregated and de-identified data</h2>
        <p>
          We may create aggregated or de-identified datasets that do not reasonably identify you or your Organization,
          and use such data for analytics, benchmarking, research, marketing, and service improvement. We will not
          attempt to re-identify de-identified data except as permitted by law or to test the effectiveness of
          de-identification techniques under controlled conditions.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="priv-nevada">
        <h2 id="priv-nevada">22. Nevada residents</h2>
        <p>
          Nevada residents may submit a verified request directing us not to sell certain categories of personal
          information we have collected, even if we do not currently sell such information as defined under Nevada law.
          Submit requests to <a href={`mailto:${NOTUS_CONTACT_EMAIL}`}>{NOTUS_CONTACT_EMAIL}</a> with subject line
          &quot;Nevada Privacy Request.&quot;
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="priv-eea-complaint">
        <h2 id="priv-eea-complaint">23. Supervisory authority complaints</h2>
        <p>
          If you are located in the EEA, UK, or Switzerland, you have the right to lodge a complaint with a supervisory
          authority in your country of residence, place of work, or place of an alleged infringement. We encourage you
          to contact us first so we can address your concern.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="priv-enterprise">
        <h2 id="priv-enterprise">24. Enterprise customers and data processing agreements</h2>
        <p>
          Customers purchasing enterprise offerings may execute a Data Processing Addendum that supplements this Privacy
          Policy with processor obligations, details of processing activities, assistance with data protection impact
          assessments where appropriate, and contractual terms regarding subprocessors, audits, and deletion at the end
          of service. In the event of a conflict between this Privacy Policy and a signed DPA with respect to processing
          performed as a processor, the DPA controls.
        </p>
      </section>
    </>
  )
}

