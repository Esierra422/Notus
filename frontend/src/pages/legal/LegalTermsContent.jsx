import { Link } from 'react-router-dom'
import { NOTUS_CONTACT_EMAIL } from '../AppCompanyPages'

/**
 * Full Terms of Service body (in-app). B2B SaaS collaboration product terms.
 */
export function LegalTermsOfServiceSections() {
  return (
    <>
      <section className="app-legal-block" aria-labelledby="terms-agreement">
        <h2 id="terms-agreement">1. Agreement to these terms</h2>
        <p>
          These Terms of Service (&quot;Terms&quot;) govern access to and use of the Notus online services, software,
          documentation, and related offerings (collectively, the &quot;Services&quot;) provided by Notus
          (&quot;Notus,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). By clicking to accept, executing an
          order form or online checkout that references these Terms, or by using the Services, you agree to these Terms
          on behalf of yourself and, if you use the Services on behalf of an organization, that organization
          (&quot;Customer&quot;).
        </p>
        <p>
          If you are accepting on behalf of a Customer, you represent and warrant that you have authority to bind the
          Customer. If you do not have such authority, or if you do not agree with these Terms, you must not use the
          Services. If you are an individual end user whose access is provisioned by a Customer, your use may also be
          subject to your Organization&apos;s policies; these Terms govern your relationship with Notus regarding the
          Services.
        </p>
        <p>
          Certain enterprise Customers may instead (or additionally) be governed by a master subscription agreement,
          statement of work, or other written contract (&quot;Master Agreement&quot;). If there is a conflict between
          these Terms and a signed Master Agreement, the Master Agreement controls for that Customer, except that
          policies linked from the Services (such as the Privacy Policy) apply to all users unless expressly excluded.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="terms-definitions">
        <h2 id="terms-definitions">2. Definitions</h2>
        <ul>
          <li>
            <strong>&quot;Customer&quot;</strong> means the entity identified on an order, subscription, or account
            that purchases or registers for the Services.
          </li>
          <li>
            <strong>&quot;User&quot;</strong> means any individual authorized by Customer to use the Services (for
            example, employees, contractors, or guests).
          </li>
          <li>
            <strong>&quot;Customer content&quot;</strong> means data, files, text, audio, video, images, and other
            materials submitted to the Services by Users or Customer.
          </li>
          <li>
            <strong>&quot;Documentation&quot;</strong> means Notus&apos;s then-current technical and user documentation
            made generally available for the Services.
          </li>
          <li>
            <strong>&quot;Order&quot;</strong> means an order form, online checkout, or in-product upgrade that specifies
            Services, quantities, fees, and term.
          </li>
        </ul>
      </section>

      <section className="app-legal-block" aria-labelledby="terms-access">
        <h2 id="terms-access">3. Access grant</h2>
        <p>
          Subject to these Terms and payment of applicable fees, Notus grants Customer a non-exclusive, non-transferable
          (except as permitted in Section 24), non-sublicensable right during the subscription term to access and use
          the Services and Documentation for Customer&apos;s internal business purposes, solely for the number of seats,
          usage limits, and features purchased.
        </p>
        <p>
          Notus reserves all rights not expressly granted. No ownership rights are transferred. Customer acknowledges
          that the Services are offered as an online, hosted solution and that Customer will not receive a copy of the
          underlying software except as expressly provided.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="terms-accounts">
        <h2 id="terms-accounts">4. Accounts, credentials, and user conduct</h2>
        <p>
          Users must provide accurate registration information and maintain the confidentiality of credentials. Users
          are responsible for activities under their accounts. Customer is responsible for: (a) Users&apos; compliance
          with these Terms; (b) maintaining accurate administrator lists; and (c) promptly revoking access for Users who
          should no longer access the Services.
        </p>
        <p>
          Customer will ensure that any personal data of third parties that Customer or Users submit to the Services is
          processed lawfully and that any required notices and consents have been obtained.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="terms-acceptable">
        <h2 id="terms-acceptable">5. Acceptable use</h2>
        <p>Customer and Users must not, and must not permit others to:</p>
        <ul>
          <li>Violate applicable laws, regulations, or third-party rights, including intellectual property and privacy.</li>
          <li>
            Upload, transmit, or store unlawful, infringing, defamatory, fraudulent, harassing, hateful, or malicious
            content.
          </li>
          <li>
            Distribute malware, conduct phishing, send unsolicited bulk messages, or engage in deceptive practices through
            the Services.
          </li>
          <li>
            Probe, scan, or test the vulnerability of the Services, breach security or authentication measures, or
            access data or accounts without authorization.
          </li>
          <li>
            Interfere with or disrupt the integrity or performance of the Services or third-party data contained
            therein (for example, denial-of-service attacks, excessive automated requests contrary to Documentation).
          </li>
          <li>
            Reverse engineer, decompile, or disassemble any portion of the Services except to the limited extent
            mandatory applicable law permits despite this limitation.
          </li>
          <li>
            Copy, frame, or mirror any part of the Services, or build a competitive product or service using Notus
            proprietary materials.
          </li>
          <li>
            Use the Services to develop, train, or improve (directly or indirectly) a competing machine learning or AI
            model using Notus proprietary interfaces, except as expressly permitted in writing.
          </li>
          <li>
            Misrepresent identity, affiliation, or the source of communications; impersonate Notus or another User.
          </li>
          <li>
            Use the Services in any high-risk environment where failure could lead to death, personal injury, or
            environmental damage (for example, emergency services, aircraft navigation, or nuclear facilities), unless
            expressly agreed in a separate written agreement that addresses such use.
          </li>
        </ul>
        <p>
          Notus may investigate suspected violations and may suspend or terminate access, remove content, or cooperate
          with law enforcement where we reasonably believe such action is necessary to protect the Services, Users, or
          the public.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="terms-content">
        <h2 id="terms-content">6. Customer content and license to Notus</h2>
        <p>
          As between the parties, Customer retains all right, title, and interest in Customer content. Customer grants
          Notus a worldwide, non-exclusive, royalty-free license to host, reproduce, process, transmit, display, and
          distribute Customer content solely to provide, secure, operate, and improve the Services, to prevent or address
          technical or security issues, and as compelled by law. Notus may also create de-identified or aggregated data
          derived from use of the Services in accordance with the Privacy Policy.
        </p>
        <p>
          Customer represents and warrants that it has all rights necessary to grant the foregoing license and that
          Customer content does not violate these Terms or applicable law. Customer is solely responsible for the
          accuracy, quality, legality, and means by which Customer acquired Customer content.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="terms-ai">
        <h2 id="terms-ai">7. AI-assisted features and outputs</h2>
        <p>
          Certain features may generate automated summaries, suggestions, transcriptions, or classifications
          (&quot;Outputs&quot;). Outputs may be inaccurate, incomplete, or reflect biases in source data. Customer and
          Users are responsible for reviewing Outputs before relying on them for legal, medical, financial, safety,
          or other high-consequence decisions. Notus does not warrant Outputs for any particular purpose.
        </p>
        <p>
          To the extent Outputs incorporate or are derived from Customer content, Notus assigns to Customer any rights
          Notus may have in such Outputs, subject to the licenses Customer has granted to Notus. Notus retains rights in
          the underlying models, software, and aggregated learnings that do not identify Customer or Users, as
          described in the Privacy Policy.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="terms-ip">
        <h2 id="terms-ip">8. Notus intellectual property</h2>
        <p>
          Notus and its licensors own all rights, title, and interest in the Services, Documentation, trademarks, logos,
          and related intellectual property. Except for the limited access grant in Section 3, no rights are granted.
          Feedback (suggestions, ideas, or recommendations) provided by Customer or Users may be used by Notus without
          restriction or compensation, except where prohibited by law.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="terms-thirdparty">
        <h2 id="terms-thirdparty">9. Third-party services and integrations</h2>
        <p>
          The Services may interoperate with third-party products, APIs, or identity providers. Those third-party
          services are governed solely by their own terms and privacy policies. Notus is not responsible for third-party
          services or for any data disclosed to third parties through integrations configured by Customer.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="terms-fees">
        <h2 id="terms-fees">10. Fees, taxes, and payment</h2>
        <p>
          Fees are as stated in the Order. Unless otherwise specified, fees are billed in advance, non-cancellable, and
          non-refundable except as required by law or expressly stated in the Order. Customer is responsible for
          applicable taxes, duties, and government charges, excluding taxes based on Notus&apos;s net income. If Customer
          is tax-exempt, Customer must provide valid exemption documentation.
        </p>
        <p>
          Late payments may accrue interest at the lesser of 1.5% per month or the maximum rate permitted by law.
          Notus may suspend Services for material payment delinquency after reasonable notice when permitted by contract
          law.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="terms-trials">
        <h2 id="terms-trials">11. Trials, betas, and free tiers</h2>
        <p>
          Trial, beta, or free offerings are provided &quot;as is&quot; without warranty and may be discontinued at any
          time. Features may differ from production offerings. Unless converted to a paid subscription, trial data may
          be deleted according to in-product notices or Documentation.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="terms-sla">
        <h2 id="terms-sla">12. Service levels and support</h2>
        <p>
          Notus will use commercially reasonable efforts to make the Services available in accordance with any service
          level agreement (&quot;SLA&quot;) referenced in the Order. If no SLA applies, Notus does not guarantee
          uninterrupted access. Planned maintenance will be scheduled when practicable with advance notice. Support
          channels and response targets, if any, are described in the Order or Documentation.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="terms-changes">
        <h2 id="terms-changes">13. Changes to the Services and Terms</h2>
        <p>
          Notus may modify the Services to improve security, performance, or functionality, or to comply with law.
          Material adverse changes to paid production features will be communicated as required by the Order or Master
          Agreement.
        </p>
        <p>
          Notus may update these Terms by posting a revised version in the Services and updating the effective date. If
          changes materially affect Customer&apos;s rights, Notus will provide additional notice (for example, email or
          in-administrator console). Continued use after the effective date constitutes acceptance, except where
          applicable law requires explicit consent.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="terms-privacy">
        <h2 id="terms-privacy">14. Privacy and security</h2>
        <p>
          Notus processes personal data as described in the <Link to="/app/privacy">Privacy Policy</Link>. Security
          practices are summarized in the <Link to="/app/security">Security</Link> overview. Enterprise Customers may
          execute a DPA incorporating standard contractual clauses or other transfer mechanisms where required.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="terms-confidential">
        <h2 id="terms-confidential">15. Confidentiality</h2>
        <p>
          Each party (&quot;Recipient&quot;) may receive non-public information from the other (&quot;Discloser&quot;)
          that is identified as confidential or that reasonably should be understood to be confidential
          (&quot;Confidential Information&quot;). Recipient will use Discloser&apos;s Confidential Information only to
          perform under these Terms and will protect it using reasonable care. Confidential Information does not include
          information that Recipient can document is public, independently developed, or rightfully received from a
          third party without duty of confidentiality.
        </p>
        <p>
          Recipient may disclose Confidential Information if required by law, provided (unless prohibited) Recipient
          gives reasonable advance notice to Discloser to contest the disclosure.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="terms-warranty">
        <h2 id="terms-warranty">16. Warranties and disclaimers</h2>
        <p>
          Each party warrants that it has validly entered into these Terms. Notus warrants that the Services will perform
          materially in accordance with the applicable Documentation during a paid subscription. Customer&apos;s
          exclusive remedy for a breach of this warranty is, at Notus&apos;s option, re-performance or refund of fees paid
          for the deficient Services for the period in which the breach occurred.
        </p>
        <p>
          EXCEPT AS EXPRESSLY PROVIDED, THE SERVICES AND DOCUMENTATION ARE PROVIDED &quot;AS IS&quot; AND &quot;AS
          AVAILABLE.&quot; TO THE MAXIMUM EXTENT PERMITTED BY LAW, NOTUS DISCLAIMS ALL IMPLIED WARRANTIES, INCLUDING
          MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. NOTUS DOES NOT WARRANT THAT THE
          SERVICES WILL BE ERROR-FREE OR UNINTERRUPTED.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="terms-indemnity">
        <h2 id="terms-indemnity">17. Indemnification</h2>
        <p>
          Customer will defend Notus and its affiliates, officers, directors, and employees against any third-party
          claim arising from Customer content, Customer&apos;s use of the Services in violation of these Terms, or
          Customer&apos;s violation of law, and Customer will pay reasonable attorneys&apos; fees and damages finally
          awarded or approved in settlement.
        </p>
        <p>
          Notus will defend Customer against a third-party claim that the Services, as provided by Notus without
          modification and used in accordance with the Documentation, infringe a patent, copyright, or trademark, and
          will pay damages finally awarded by a court of competent jurisdiction or agreed in settlement, subject to
          Customer&apos;s prompt notice, reasonable cooperation, and sole control of the defense for Notus. If the
          Services become enjoined, Notus may, at its option, procure rights, modify the Services, or terminate and
          refund prepaid fees for the remainder of the term. Notus has no obligation for claims arising from Customer
          content, combinations with non-Notus products, or use after notice to discontinue.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="terms-liability">
        <h2 id="terms-liability">18. Limitation of liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, EXCEPT FOR (A) EITHER PARTY&apos;S INDEMNITY OBLIGATIONS SUBJECT TO
          THIS SECTION, (B) CUSTOMER&apos;S PAYMENT OBLIGATIONS, OR (C) LIABILITY THAT CANNOT BE LIMITED BY LAW, NEITHER
          PARTY&apos;S AGGREGATE LIABILITY ARISING OUT OF OR RELATED TO THESE TERMS WILL EXCEED THE AMOUNT PAID BY
          CUSTOMER TO NOTUS FOR THE SERVICES IN THE TWELVE (12) MONTHS BEFORE THE EVENT GIVING RISE TO LIABILITY (OR, IF
          NO FEES APPLY, ONE HUNDRED U.S. DOLLARS (US$100)).
        </p>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, NEITHER PARTY WILL BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
          CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR LOSS OF PROFITS, REVENUE, GOODWILL, OR DATA, EVEN IF
          ADVISED OF THE POSSIBILITY.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="terms-term">
        <h2 id="terms-term">19. Term, suspension, and termination</h2>
        <p>
          These Terms commence on acceptance and continue until all subscriptions expire or are terminated. Unless
          otherwise stated in the Order, subscriptions renew for successive terms equal to the initial term unless
          either party provides non-renewal notice at least thirty (30) days before the renewal date.
        </p>
        <p>
          Either party may terminate for material breach that remains uncured thirty (30) days after written notice (or
          ten (10) days for non-payment). Notus may suspend access immediately if necessary to prevent harm to the
          Services or other customers, or to comply with law, with notice when practicable.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="terms-effect">
        <h2 id="terms-effect">20. Effect of termination</h2>
        <p>
          Upon expiration or termination, Customer&apos;s right to access the Services ceases. Notus will delete or
          return Customer content as described in the Documentation, Order, or DPA, subject to legal retention
          requirements. Sections intended to survive (including intellectual property, confidentiality, disclaimers,
          limitation of liability, indemnity, governing law, and dispute resolution) will survive.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="terms-export">
        <h2 id="terms-export">21. Export compliance and sanctions</h2>
        <p>
          Customer will comply with all applicable export control and sanctions laws. Customer represents that it is not
          located in, under the control of, or a national or resident of any country or entity subject to comprehensive
          embargoes or prohibited end-user restrictions, and will not use the Services in violation of those
          restrictions.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="terms-gov">
        <h2 id="terms-gov">22. Government users</h2>
        <p>
          If Customer is a U.S. government entity, use of the Services is subject to federal acquisition regulations as
          implemented in the applicable Order. Commercial computer software is licensed under these Terms as commercial
          items.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="terms-dmca">
        <h2 id="terms-dmca">23. Copyright complaints</h2>
        <p>
          If you believe materials in the Services infringe your copyright, send a notice to{' '}
          <a href={`mailto:${NOTUS_CONTACT_EMAIL}`}>{NOTUS_CONTACT_EMAIL}</a> with the information required by applicable
          law, including identification of the work, the allegedly infringing material, your contact information, and a
          statement of good faith belief. We may remove or disable access to material in appropriate circumstances and
          terminate repeat infringers where required.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="terms-law">
        <h2 id="terms-law">24. Governing law and venue</h2>
        <p>
          Unless a Master Agreement specifies otherwise, these Terms are governed by the laws of the State of Delaware,
          United States, without regard to conflict-of-law principles. The United Nations Convention on Contracts for
          the International Sale of Goods does not apply. Subject to Section 25, exclusive jurisdiction and venue for any
          dispute will be the state and federal courts located in Delaware, and each party submits to personal
          jurisdiction there.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="terms-disputes">
        <h2 id="terms-disputes">25. Dispute resolution and informal negotiation</h2>
        <p>
          Before filing a claim, the parties will attempt in good faith to resolve disputes through informal
          negotiation by escalating to designated business contacts. If not resolved within thirty (30) days, either
          party may pursue remedies in the courts identified in Section 24, unless a Master Agreement provides
          arbitration or alternative dispute resolution.
        </p>
        <p>
          If you are a consumer in a jurisdiction that provides mandatory local dispute forums or protections, those
          provisions may apply notwithstanding the foregoing to the extent required by law.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="terms-general">
        <h2 id="terms-general">26. General</h2>
        <p>
          <strong>Assignment.</strong> Neither party may assign these Terms without the other&apos;s prior written
          consent, except Notus may assign to an affiliate or in connection with a merger or sale of assets. Any
          prohibited assignment is void.
        </p>
        <p>
          <strong>Force majeure.</strong> Neither party is liable for delay or failure due to events beyond reasonable
          control, including natural disasters, war, terrorism, riots, embargoes, acts of civil or military authorities,
          fire, floods, accidents, strikes, or shortages of transportation, facilities, fuel, energy, labor, or
          materials, or failures of public networks or third-party hosting.
        </p>
        <p>
          <strong>Notices.</strong> Notices to Customer may be sent to the administrator email on file or posted in the
          Services. Notices to Notus must be sent to <a href={`mailto:${NOTUS_CONTACT_EMAIL}`}>{NOTUS_CONTACT_EMAIL}</a>{' '}
          with copy as specified in a Master Agreement.
        </p>
        <p>
          <strong>Entire agreement; severability; waiver.</strong> These Terms, together with the Privacy Policy, Order,
          and any Master Agreement, constitute the entire agreement. If a provision is unenforceable, it will be
          modified to the minimum extent necessary; the remainder remains in effect. Failure to enforce a provision is
          not a waiver.
        </p>
        <p>
          <strong>Independent contractors.</strong> The parties are independent contractors; no agency, partnership, or
          joint venture is created.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="terms-publicity">
        <h2 id="terms-publicity">27. Publicity and references</h2>
        <p>
          Unless otherwise agreed in writing, Notus may use Customer&apos;s name and logo on customer lists and
          marketing materials. Customer may revoke this permission by email to{' '}
          <a href={`mailto:${NOTUS_CONTACT_EMAIL}`}>{NOTUS_CONTACT_EMAIL}</a>; revocation applies prospectively within a
          reasonable implementation period.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="terms-audit">
        <h2 id="terms-audit">28. Audits and compliance assistance</h2>
        <p>
          Enterprise Customers with a Master Agreement may have the right to request information or audits related to
          Notus&apos;s processing of Customer personal data, subject to confidentiality, frequency limits, and
          reasonable advance notice. Notus may satisfy audit rights through third-party certifications or standardized
          questionnaires where available in lieu of on-site audits.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="terms-insurance">
        <h2 id="terms-insurance">29. Insurance</h2>
        <p>
          Notus maintains commercially appropriate insurance coverage for its business operations. Specific coverage
          amounts and certificates may be provided to enterprise Customers upon reasonable request subject to
          confidentiality.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="terms-contact">
        <h2 id="terms-contact">30. Contact</h2>
        <p>
          Questions about these Terms: <a href={`mailto:${NOTUS_CONTACT_EMAIL}`}>{NOTUS_CONTACT_EMAIL}</a> or{' '}
          <Link to="/app/contact">Contact</Link>.
        </p>
      </section>
    </>
  )
}
