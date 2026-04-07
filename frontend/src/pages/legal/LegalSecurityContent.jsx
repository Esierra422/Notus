import { Link } from 'react-router-dom'
import { NOTUS_CONTACT_EMAIL } from '../AppCompanyPages'

/**
 * Security overview / trust center style content (in-app). Operational detail for enterprise readers.
 */
export function LegalSecurityPolicySections() {
  return (
    <>
      <section className="app-legal-block" aria-labelledby="sec-overview">
        <h2 id="sec-overview">1. Purpose and scope</h2>
        <p>
          This Security Overview describes the administrative, technical, and physical safeguards Notus applies to
          protect the confidentiality, integrity, and availability of information processed in connection with the
          Notus Services. It is intended to help Customers assess risk, satisfy internal security questionnaires, and
          align with procurement and compliance workflows.
        </p>
        <p>
          Specific contractual commitments (for example, SLAs, audit rights, or subprocessors) may be set forth in your
          Order, Master Agreement, or Data Processing Addendum. In the event of a conflict between this overview and a
          signed agreement, the agreement controls.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="sec-governance">
        <h2 id="sec-governance">2. Security governance and risk management</h2>
        <p>
          Notus maintains a security program aligned to recognized frameworks (including elements consistent with SOC 2
          Trust Services Criteria, ISO/IEC 27001 control themes, and NIST Cybersecurity Framework functions). We
          document policies and standards covering access control, change management, incident response, vendor risk,
          business continuity, and acceptable use. Policies are reviewed at least annually and upon material changes to
          the Services or threat landscape.
        </p>
        <p>
          We perform periodic risk assessments to identify threats to Customer data and Notus operations, prioritize
          remediation, and track treatment plans. Material risks are escalated to leadership. We maintain a register of
          processing activities relevant to personal data where required by privacy law.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="sec-org">
        <h2 id="sec-org">3. Organizational security</h2>
        <p>
          Access to production systems and Customer data is granted on a least-privilege, need-to-know basis and is
          reviewed at regular intervals. Background checks or equivalent screening may be performed for employees and
          contractors with elevated access, subject to applicable law. All personnel with access to confidential
          information receive security and privacy training at onboarding and refresher training thereafter.
        </p>
        <p>
          Confidentiality obligations are included in employment and contractor agreements. Violations may result in
          disciplinary action up to and including termination and legal remedies where appropriate.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="sec-iam">
        <h2 id="sec-iam">4. Identity, authentication, and authorization</h2>
        <p>
          The Services support authentication through industry-standard identity providers. Password policies encourage
          strong credentials; multi-factor authentication should be enabled where available, especially for
          administrative accounts. Session tokens are issued with limited lifetimes and are invalidated on sign-out or
          password reset where technically feasible.
        </p>
        <p>
          Authorization is enforced at the application layer and backed by database security rules so that Users can
          access only organizations, teams, channels, meetings, and files for which they have been granted rights.
          Administrative actions are designed to be attributable to individual administrator accounts.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="sec-encryption">
        <h2 id="sec-encryption">5. Encryption and key management</h2>
        <p>
          Data in transit between Users&apos; browsers or clients and Notus-controlled endpoints is protected using
          TLS 1.2 or higher with modern cipher suites. APIs and webhooks are expected to use HTTPS. Data at rest in
          managed databases and object storage is encrypted using provider-managed keys or customer-managed keys where
          supported by the architecture and agreement.
        </p>
        <p>
          Secrets, API keys, and signing credentials are stored in secure configuration systems with access restricted
          to authorized engineering roles. Key rotation procedures are followed for critical credentials according to
          risk and provider guidance.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="sec-network">
        <h2 id="sec-network">6. Network and perimeter security</h2>
        <p>
          Production workloads run on leading cloud infrastructure providers with network segmentation between
          environments (for example, production versus development). Firewalls, deny-by-default security groups, and
          web application protections are employed as appropriate. Administrative access to production networks typically
          requires VPN or zero-trust access tools and MFA.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="sec-logging">
        <h2 id="sec-logging">7. Logging, monitoring, and detection</h2>
        <p>
          Notus collects security-relevant logs including authentication events, administrative changes, API errors,
          and infrastructure health metrics. Logs are protected against unauthorized modification and retained for a
          period consistent with operational and legal requirements. Automated alerting is configured for anomalous
          patterns such as authentication spikes, permission changes, and error rate increases.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="sec-vuln">
        <h2 id="sec-vuln">8. Vulnerability and patch management</h2>
        <p>
          We identify vulnerabilities through dependency scanning, code review, security testing, and third-party
          reports. Critical vulnerabilities are prioritized for remediation based on severity, exploitability, and
          exposure. Patches are applied to production systems according to internal SLAs that consider CVSS scores and
          business impact. Emergency patches may be deployed outside normal release windows.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="sec-sdlc">
        <h2 id="sec-sdlc">9. Secure development lifecycle</h2>
        <p>
          Engineering follows documented practices for branching, peer review, automated testing, and staged rollouts.
          Security considerations are integrated into design reviews for features that affect authentication,
          authorization, data handling, or third-party integrations. Static analysis and dependency checks are used to
          detect common defect classes before deployment.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="sec-incident">
        <h2 id="sec-incident">10. Incident response</h2>
        <p>
          Notus maintains an incident response plan that defines roles, communication paths, evidence preservation,
          containment strategies, and post-incident review. Suspected security incidents are triaged, classified by
          severity, and escalated to leadership. Customers will be notified of incidents affecting their data in
          accordance with legal obligations and contractual commitments, including timelines for processor-to-controller
          notification where applicable.
        </p>
        <p>
          If you believe you have discovered a vulnerability in the Services, report it to{' '}
          <a href={`mailto:${NOTUS_CONTACT_EMAIL}`}>{NOTUS_CONTACT_EMAIL}</a> with subject line &quot;Security
          Disclosure&quot; and sufficient detail to reproduce the issue. Please allow reasonable time for remediation
          before public disclosure.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="sec-bc">
        <h2 id="sec-bc">11. Business continuity and disaster recovery</h2>
        <p>
          Notus designs core Services for high availability within the limits of underlying cloud providers. Backups
          are performed according to documented schedules and tested periodically. Recovery time and recovery point
          objectives vary by component and are described at a high level in enterprise documentation when available.
          Customers remain responsible for exporting critical records they require independent of Notus availability.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="sec-vendors">
        <h2 id="sec-vendors">12. Subprocessors and supply chain</h2>
        <p>
          Notus relies on subprocessors for infrastructure, communications, and specialized functions. Subprocessors
          undergo security review prior to engagement and are contractually obligated to implement appropriate controls.
          A current list or category description is available as described in the <Link to="/app/privacy">Privacy
          Policy</Link> and may be provided in annexes to enterprise agreements.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="sec-media">
        <h2 id="sec-media">13. Real-time audio, video, and media</h2>
        <p>
          Real-time meetings may be routed through certified real-time communications infrastructure operated by
          specialized vendors. Media streams are typically ephemeral during the session; metadata required for billing,
          quality, or troubleshooting may be retained according to vendor and Notus retention policies. Customers should
          treat meeting identifiers and join links as confidential credentials and configure waiting rooms, host
          controls, and recording policies consistent with their risk tolerance.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="sec-endpoint">
        <h2 id="sec-endpoint">14. Endpoint and office security</h2>
        <p>
          Company-issued and approved devices used for engineering and support are configured with disk encryption,
          screen locks, and current OS patch levels where applicable. Remote wipe or access revocation is supported for
          managed devices. Personal devices are discouraged for production access unless enrolled in a compliant
          management program.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="sec-dataclass">
        <h2 id="sec-dataclass">15. Data classification and handling</h2>
        <p>
          Notus classifies information assets to apply handling rules. Customer content is treated as high-value
          confidential data. Internal credentials and cryptographic material are restricted to roles with verified
          business need. Public marketing content is handled with lower restrictions. Labeling and access rules are
          reinforced through tooling and training.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="sec-physical">
        <h2 id="sec-physical">16. Physical and environmental controls</h2>
        <p>
          Physical security for servers is provided by our cloud hosting partners, who maintain audited data centers
          with controlled access, environmental monitoring, and redundant power and networking. Notus personnel do not
          require physical access to hardware for routine operations.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="sec-pentest">
        <h2 id="sec-pentest">17. Testing and assurance</h2>
        <p>
          Notus may perform internal penetration tests, engage qualified third-party testers, and participate in bug
          bounty programs where commercially appropriate. Summaries of assurance activities may be available to
          enterprise Customers under confidentiality, subject to scheduling and scope limitations.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="sec-customer">
        <h2 id="sec-customer">18. Shared responsibility and your obligations</h2>
        <p>
          Security is a shared responsibility. Customers and Users should: maintain strong passwords and MFA; promptly
          revoke access for departing personnel; classify sensitive meetings appropriately; limit integration scopes to
          least privilege; monitor administrator accounts; educate Users on phishing; and comply with applicable laws
          when recording or monitoring communications.
        </p>
        <p>
          Notus is not responsible for security failures caused by misconfiguration, compromised end-user devices,
          weak credentials chosen by Users, or third-party integrations outside Notus&apos;s control.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="sec-compliance">
        <h2 id="sec-compliance">19. Compliance mappings</h2>
        <p>
          Notus designs its program to support Customer compliance efforts related to data protection regulations,
          provided that compliance is a shared obligation and depends on how Customers configure and use the Services.
          Certifications, audit reports, and completed questionnaires may be available to enterprise Customers under
          NDA. Availability of specific artifacts is not guaranteed for all tiers.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="sec-tenancy">
        <h2 id="sec-tenancy">20. Logical isolation and tenancy</h2>
        <p>
          Customer workspaces are logically separated using organization identifiers, role-based access controls, and
          database-level rules designed to prevent one tenant from accessing another&apos;s data through normal product
          interfaces. Engineering changes that could affect isolation undergo additional review and testing.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="sec-malware">
        <h2 id="sec-malware">21. Malware, abuse, and content risks</h2>
        <p>
          Notus employs automated and manual measures intended to detect spam, malware, and abusive behavior within the
          Services. Files and links may be scanned using third-party threat intelligence where integrated. False
          positives may occur; Customers may contact support to appeal blocking decisions where workflows permit.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="sec-deletion">
        <h2 id="sec-deletion">22. Secure deletion and data lifecycle</h2>
        <p>
          When Customer content is deleted through product workflows or upon contractually agreed termination timelines,
          Notus uses provider APIs and internal procedures designed to remove data from active systems. Residual
          fragments may persist in encrypted backups for a limited period until rotation cycles complete. Cryptographic
          erasure may be used where applicable.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="sec-cicd">
        <h2 id="sec-cicd">23. Build, release, and configuration integrity</h2>
        <p>
          Production deployments originate from controlled repositories with signed commits or protected branches where
          configured. Infrastructure-as-code definitions are reviewed to prevent accidental public exposure of
          resources. Secrets are not embedded in client-side code beyond what is required for public client SDKs (for
          example, application identifiers scoped to security rules).
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="sec-updates">
        <h2 id="sec-updates">24. Changes to this overview</h2>
        <p>
          We may update this Security Overview to reflect improvements, new features, or regulatory expectations. The
          last updated date in the page header indicates the latest revision. For contractual security commitments,
          refer to your agreement.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="sec-contact">
        <h2 id="sec-contact">25. Contact</h2>
        <p>
          Security questions: <a href={`mailto:${NOTUS_CONTACT_EMAIL}`}>{NOTUS_CONTACT_EMAIL}</a> (subject:
          &quot;Security&quot;) or <Link to="/app/contact">Contact</Link>.
        </p>
      </section>
    </>
  )
}
