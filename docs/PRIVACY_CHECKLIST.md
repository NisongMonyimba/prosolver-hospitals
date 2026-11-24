# Privacy launch checklist

The public notice is a draft and signups are disabled. The founder or qualified adviser must complete:

- Legal operator/data controller name, registered address and monitored privacy contact.
- Purpose-by-purpose lawful basis, contact consent, optional research permission and withdrawal handling.
- Actual Cloudflare, Resend and GitHub processing locations, subprocessor terms and international transfer safeguards.
- Retention periods for submissions, audio, consent, audit and backups; deletion response and backup expiry.
- Access, correction, deletion and complaint process with identity verification and response times.
- Clear patient-data and confidential-employer-data prohibition, incident response and staff access controls.
- Ghana Data Protection Commission registration applicability and evidence of any required registration.

Ghana's [Data Protection Act, 2012 (Act 843)](https://dataprotection.org.gh/wp-content/uploads/2025/05/Data-Protection-Act-2012-Act-843.pdf) describes data-controller registration and information required in an application. The [Commission's compliance guidelines](https://dataprotection.org.gh/wp-content/uploads/2025/07/GUIDELINES-TO-DEMONSTRATE-DATA-PROTECTION-COMPLIANCE-1.pdf) discuss registration and organisational measures. The founder must verify the current law, whether registration applies, and the correct process with the Commission or a qualified adviser; this repository makes no claim of legal compliance.

After approval, replace all `REQUIRED BEFORE LAUNCH` text in `public/privacy.html`; change the matching notice version in `worker/src/index.js` and `public/index.html`; record approval in project documentation; set `PRIVACY_NOTICE_APPROVED=true` only at the controlled launch gate. Public submission must remain disabled until then.
