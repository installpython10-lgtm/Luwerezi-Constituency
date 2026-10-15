/**
 * Mzimba Luwerezi Constituency — Community Reporting & Tracking Module
 * Handles public issue submission, reference generation, status tracking, and safeguarding intake.
 */

import { getSupabase, getCurrentUser } from './supabase-client.js';
import { t } from './i18n.js';

/**
 * Generates an official case reference code (e.g., LUW-REP-4819).
 * @param {'REP' | 'SAFE'} prefixType 
 * @returns {string}
 */
function generateReferenceCode(prefixType = 'REP') {
  const timestampPart = Date.now().toString().slice(-4);
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return `LUW-${prefixType}-${timestampPart}${randomPart}`;
}

/**
 * Initializes Community Issue Submission Form on report-issue.html.
 */
export function initReportSubmission() {
  const form = document.getElementById('communityReportForm');
  if (!form) return;

  const anonymousCheck = document.getElementById('reportAnonymousCheck');
  const personalFields = document.getElementById('reporterPersonalFields');
  const errorBanner = document.getElementById('reportErrorBanner');
  const successBox = document.getElementById('reportSuccessBox');
  const submitBtn = document.getElementById('submitReportBtn');

  // Anonymous toggle handler
  if (anonymousCheck && personalFields) {
    anonymousCheck.addEventListener('change', () => {
      personalFields.style.display = anonymousCheck.checked ? 'none' : 'block';
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errorBanner) errorBanner.style.display = 'none';

    const category = document.getElementById('reportCategory')?.value;
    const ward = document.getElementById('reportWard')?.value?.trim();
    const village = document.getElementById('reportVillage')?.value?.trim();
    const title = document.getElementById('reportTitle')?.value?.trim();
    const description = document.getElementById('reportDescription')?.value?.trim();
    const isAnonymous = anonymousCheck ? anonymousCheck.checked : false;
    const reporterName = isAnonymous ? null : document.getElementById('reporterName')?.value?.trim() || null;
    const reporterPhone = isAnonymous ? null : document.getElementById('reporterPhone')?.value?.trim() || null;
    const reporterEmail = isAnonymous ? null : document.getElementById('reporterEmail')?.value?.trim() || null;
    const fileInput = document.getElementById('reportAttachment');

    // Basic validation
    if (!category || !ward || !village || !title || !description) {
      if (errorBanner) {
        errorBanner.textContent = t('form_validation_required', 'Please fill in all required fields marked with an asterisk.');
        errorBanner.style.display = 'block';
      }
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
    }

    try {
      const sb = await getSupabase();
      const currentUser = await getCurrentUser();
      const referenceNumber = generateReferenceCode('REP');

      let attachmentUrl = null;

      // Handle optional file upload if Supabase Storage is configured
      if (fileInput && fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        const fileExt = file.name.split('.').pop();
        const filePath = `reports/${referenceNumber}-${Date.now()}.${fileExt}`;
        try {
          const { data: uploadData, error: uploadError } = await sb.storage
            .from('report-evidence')
            .upload(filePath, file);

          if (!uploadError && uploadData) {
            const { data: publicUrlData } = sb.storage.from('report-evidence').getPublicUrl(filePath);
            attachmentUrl = publicUrlData?.publicUrl || null;
          }
        } catch (uploadEx) {
          console.warn('[Reporting] Attachment upload bypassed or bucket offline:', uploadEx);
        }
      }

      // Insert report into community_reports table
      const { error: insertError } = await sb
        .from('community_reports')
        .insert([{
          reference_number: referenceNumber,
          category,
          ward,
          village,
          title,
          description,
          attachment_url: attachmentUrl,
          is_anonymous: isAnonymous,
          reporter_name: reporterName,
          reporter_phone: reporterPhone,
          reporter_email: reporterEmail,
          user_id: currentUser ? currentUser.id : null,
          status: 'Submitted',
          status_history: [{
            status: 'Submitted',
            timestamp: new Date().toISOString(),
            notes: 'Report received and registered in parliamentary case queue.'
          }]
        }]);

      if (insertError) {
        throw insertError;
      }

      // Display success view
      form.style.display = 'none';
      if (successBox) {
        const refDisplay = document.getElementById('generatedRefDisplay');
        if (refDisplay) refDisplay.textContent = referenceNumber;
        const trackLink = document.getElementById('trackNowLink');
        if (trackLink) trackLink.href = `track-report.html?ref=${referenceNumber}`;
        successBox.style.display = 'block';
        successBox.focus();
      }
    } catch (err) {
      console.error('[Reporting] Submission error:', err);
      if (errorBanner) {
        errorBanner.textContent = 'Unable to log report. Please check your network connection or contact PA Funny Longwe directly.';
        errorBanner.style.display = 'block';
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = t('btn_submit_report_now', 'Submit Community Report');
      }
    }
  });

  // "Submit another report" button
  const submitAnotherBtn = document.getElementById('submitAnotherReportBtn');
  if (submitAnotherBtn) {
    submitAnotherBtn.addEventListener('click', () => {
      form.reset();
      form.style.display = 'block';
      if (successBox) successBox.style.display = 'none';
    });
  }
}

/**
 * Initializes Public Report Tracking Form on track-report.html.
 */
export function initReportTracking() {
  const form = document.getElementById('trackReportForm');
  const input = document.getElementById('trackRefInput');
  const resultContainer = document.getElementById('trackResultContainer');
  const errorEl = document.getElementById('trackRefError');

  if (!form || !resultContainer) return;

  // Auto-search if ref parameter exists in URL
  const urlParams = new URLSearchParams(window.location.search);
  const queryRef = urlParams.get('ref');
  if (queryRef && input) {
    input.value = queryRef.toUpperCase();
    performLookup(queryRef.trim().toUpperCase());
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (errorEl) errorEl.textContent = '';
    const ref = input?.value?.trim().toUpperCase();

    if (!/^LUW-REP-\d{8}$/.test(ref)) {
      if (errorEl) errorEl.textContent = 'Please enter a valid report reference number.';
      return;
    }
    performLookup(ref);
  });

  async function performLookup(ref) {
    resultContainer.innerHTML = `
      <div class="empty-state-card">
        <p class="empty-state-title">Retrieving status for ${ref}...</p>
      </div>
    `;

    try {
      const sb = await getSupabase();
      const { data, error } = await sb
        .rpc('track_community_report', { lookup_reference: ref })
        .maybeSingle();

      if (error || !data) {
        resultContainer.innerHTML = `
          <div class="alert-box alert-error">
            <strong>Reference Not Found:</strong> No registered case matches "${ref}". Please check the spelling or contact the constituency office.
          </div>
        `;
        return;
      }

      renderReportTrackingCard(data);
    } catch (err) {
      console.error('[Track] Lookup error:', err);
      resultContainer.innerHTML = `
        <div class="alert-box alert-error">
          Network error retrieving status. Please try again or reach the administrative desk.
        </div>
      `;
    }
  }

  function renderReportTrackingCard(report) {
    const statuses = ['Submitted', 'Under Review', 'Assigned', 'In Progress', 'Resolved'];
    const currentStatusIndex = statuses.indexOf(report.status) !== -1 ? statuses.indexOf(report.status) : 1;

    const stepperHtml = `
      <div class="status-stepper" aria-label="Resolution progress">
        ${statuses.map((st, idx) => `
          <div class="stepper-step ${idx < currentStatusIndex ? 'completed' : ''} ${idx === currentStatusIndex ? 'active' : ''}">
            <div class="step-bubble">${idx + 1}</div>
            <div class="step-label">${st}</div>
          </div>
        `).join('')}
      </div>
    `;

    const timelineItems = (report.status_history || []).map((item) => `
      <li class="timeline-item">
        <span class="timeline-date">${item.timestamp ? new Date(item.timestamp).toLocaleDateString() : ''}</span>
        <strong class="timeline-text block">${item.status}</strong>
      </li>
    `).join('');

    resultContainer.innerHTML = `
      <article class="card p-6 border-2">
        <div class="flex justify-between items-start flex-wrap gap-2 border-b pb-3 mb-4">
          <div>
            <span class="badge badge-mono">${report.reference_number}</span>
            <h2 class="text-xl font-bold mt-1">Community Report Status</h2>
          </div>
          <div>
            <span class="badge badge-accent">${report.status}</span>
          </div>
        </div>

        ${stepperHtml}

        <div class="mt-6 pt-4 border-t">
          <h3 class="font-bold text-sm mb-3">Case History Log</h3>
          <ol class="timeline-stack">
            ${timelineItems || '<li class="timeline-item"><span class="text-xs text-muted">Awaiting initial administrative review.</span></li>'}
          </ol>
        </div>
      </article>
    `;
  }
}

/**
 * Initializes Confidential Safeguarding Intake Form on safeguarding.html.
 */
export function initSafeguardingIntake() {
  const form = document.getElementById('safeguardingReportForm');
  if (!form) return;

  const errorBanner = document.getElementById('safeguardErrorBanner');
  const successBox = document.getElementById('safeguardSuccessBox');
  const submitBtn = document.getElementById('submitSafeguardBtn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errorBanner) errorBanner.style.display = 'none';

    const concernType = document.getElementById('safeguardType')?.value;
    const location = document.getElementById('safeguardLocation')?.value?.trim();
    const narrative = document.getElementById('safeguardNarrative')?.value?.trim();
    const safeContact = document.getElementById('safeguardSafeContact')?.value?.trim() || null;

    if (!concernType || !location || !narrative) {
      if (errorBanner) {
        errorBanner.textContent = 'Please state the nature of concern, approximate location, and narrative.';
        errorBanner.style.display = 'block';
      }
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Encrypting & Routing...';
    }

    try {
      const sb = await getSupabase();
      const intakeKey = generateReferenceCode('SAFE');

      // Insert into segregated safeguarding_reports table
      const { error: insertError } = await sb
        .from('safeguarding_reports')
        .insert([{
          intake_key: intakeKey,
          concern_type: concernType,
          location_approx: location,
          narrative: narrative,
          safe_contact_method: safeContact,
          status: 'Restricted Intake Received',
          created_at: new Date().toISOString()
        }]);

      if (insertError) {
        throw insertError;
      }

      form.style.display = 'none';
      if (successBox) {
        const keyDisplay = document.getElementById('safeguardRefDisplay');
        if (keyDisplay) keyDisplay.textContent = intakeKey;
        successBox.style.display = 'block';
      }
    } catch (err) {
      console.error('[Safeguarding] Intake error:', err);
      if (errorBanner) {
        errorBanner.textContent = 'Error securely routing intake. In case of immediate emergency, please dial 116 or 997 directly.';
        errorBanner.style.display = 'block';
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = t('btn_submit_confidential_safeguard', 'Submit Confidential Safeguarding Report');
      }
    }
  });
}