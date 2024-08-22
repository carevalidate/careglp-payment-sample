(function() {
  const amount = 0.50; // amount to be paid in USD, >= 0.50
  const colorPrimary = 'rgb(107, 74, 35)'; // customizable
  const companyName = "YOUR_COMPANY"; // company name for cloud function

  let clientSecret = '';
  onDOMReady(async () => clientSecret = await initiatePayment());
  window.cvStripeLoaded = false;

  function loadStripeIfNeeded() {
    try {
      const src = 'https://js.stripe.com/v3/';
      let script = document.querySelector(`script[src^='${src}']`);
      if (script) window.cvStripeLoaded = true;
      if (window.cvStripeLoaded) return;

      script = script || document.createElement('script');
      script.src = src;
      script.onload = () => window.cvStripeLoaded = true;
      script.onerror = () => {
        console.error('Failed to load script:', src);
        window.cvStripeLoaded = false;
      };
      document.head.appendChild(script);
    } catch (err) {
      console.error(err);
      window.cvStripeLoaded = false;
    }
  }

  function debounce(func, delay) {
    let timeout;
    return function() {
      const context = this;
      const args = arguments;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), delay);
    };
  }

  const observerCallback = debounce(function() {
    document.querySelectorAll('.elementor-form .elementor-field-label').forEach(label => {
      const stepAncestor = label.closest('.elementor-field-type-step:not(.elementor-hidden)');
      if (stepAncestor) {
        loadStripeIfNeeded();
        if (label.getAttribute('for') === 'form-field-stripe_setup_id') {
          window.cvObserver?.disconnect?.();
          hideElementorInputsInStep(stepAncestor);
          initializeStripeElements(stepAncestor);
          // setTimeout(() => console.log(stepAncestor), 2500);
        }
      }
    });
  }, 75);

  window.cvObserver?.disconnect();
  window.cvObserver = new MutationObserver(observerCallback);
  window.cvObserver.observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
  });

  async function initiatePayment() {
    try {
      const response = await fetch(
        `https://us-central1-care-gpt.cloudfunctions.net/initiatePayment?companyName=${companyName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ amount })
      });
      const data = await response.json();
      return data.paymentSecret;
    } catch (error) {
      console.error('Error initiating payment:', error);
    }
  }

  async function initializeStripeElements(stepAncestor) {
    if (!window.cvStripeLoaded) return;

    const stripe = Stripe('pk_live_51HqSIiKAXrtjbq2dtXcGLkFqhqPquraau6jRB8nDCrDVIGj7me2ZEAiQxZNwuG9A7Y1Gzn6vg8xslQuCpoTByMKd00cmPemstt');
    const appearance = {
      theme: 'stripe',
    
      variables: {
        borderRadius: '5px',
        colorBackground: '#FFFFFF',
        colorDanger: '#fa755a',
        colorPrimary,
        colorText: '#000000',
        fontFamily: '"Noto Sans", sans-serif',
        fontSizeBase: '18px',
        // spacingUnit: '6px',
      },
    };

    const fontSource = {
      cssSrc: 'https://fonts.googleapis.com/css?family=Noto+Sans'
    };

            
    const elements = stripe.elements({ fonts: [fontSource], clientSecret, appearance });
    const buttonWrapper = stepAncestor.querySelector('.e-form__buttons');
    const stripeContainer = document.createElement('div');
    stripeContainer.style.width = '100%';
    stripeContainer.style.marginBottom = '20px';
    buttonWrapper.parentNode.insertBefore(stripeContainer, buttonWrapper);

    const form = document.createElement('form');
    form.onsubmit = event => event.preventDefault();
    form.id = 'payment-form';
    form.style.width = '100%';
    stripeContainer.appendChild(form);

    const addressElement = document.createElement('div');
    addressElement.id = 'address-element';
    const addressErrors = document.createElement('div');
    addressErrors.id = 'address-errors';
    addressErrors.setAttribute('role', 'alert');
    form.appendChild(addressElement);
    form.appendChild(addressErrors);

    const cardElement = document.createElement('div');
    cardElement.id = 'card-element';
    const cardErrors = document.createElement('div');
    cardErrors.id = 'card-errors';
    cardErrors.setAttribute('role', 'alert');
    form.appendChild(cardElement);
    form.appendChild(cardErrors);

    const paymentSuccess = document.createElement('div');
    paymentSuccess.id = 'payment-success';
    paymentSuccess.style.display = 'none';
    buttonWrapper.parentNode.insertBefore(paymentSuccess, buttonWrapper);

    let shippingAddress = null;
    const address = elements.create('address', {
      appearance: appearance,
      allowedCountries: ['US'],
      defaultValues: {
        name: document.getElementById('form-field-firstname').value +
          ' ' + document.getElementById('form-field-lastname').value,
      },
      mode: 'shipping',
    });
    address.mount('#address-element');

    address.on('change', event => {
      if (event.error) {
        addressErrors.textContent = event.error.message;
      } else {
        addressErrors.textContent = '';
        const addr = event.complete && event.value.address;
        if (addr) shippingAddress = {
          addressLine1: document.getElementById('form-field-shipping_add_line1').value = addr.line1 || '',
          addressLine2: document.getElementById('form-field-shipping_add_line2').value = addr.line2 || '',
          city: document.getElementById('form-field-shipping_city').value = addr.city || '',
          state: document.getElementById('form-field-shipping_state').value = addr.state || '',
          country: addr.country,
          postalCode: document.getElementById('form-field-shipping_zip').value = addr.postal_code || '',
        };
      }
    });

    let stripeSetupId = '';
    const card = elements.create('payment', { appearance: appearance });
    card.mount('#card-element');

    card.on('change', function (event) {
      if (event.error) {
        cardErrors.textContent = event.error.message;
      } else {
        cardErrors.textContent = '';
      }
    });

    const originalSendButton = stepAncestor.querySelector('.elementor-field-type-submit button[type="submit"]');
    const clonedSendButton = originalSendButton.cloneNode(true);
    originalSendButton.style.display = 'none';
    originalSendButton.parentNode.insertBefore(clonedSendButton, originalSendButton.nextSibling);

    clonedSendButton.addEventListener('click', async function (event) {
      event.preventDefault();
      this.disabled = true;
      const originalText = this.innerHTML;
      this.innerHTML='<span class="carevalidate-spinner-rotate eicon-loading ">Processing...</span>';

      async function confirmSetup() {
        const setupParams = {
          elements: elements,
          redirect: 'if_required',
        };

        const urlParams = new URLSearchParams(window.location.search);
        const email = urlParams.get('email');
        if (email) setupParams.confirmParams = {
          payment_method_data: { billing_details: { email } }
        };

        const result = await stripe.confirmSetup(setupParams);

        if (result.error && result.error.type !== 'validation_error') {
          cardErrors.textContent = result.error.message;
        } else if (!result.setupIntent || result.setupIntent.status !== 'succeeded') {
          cardErrors.textContent = 'Payment unsuccessful';
        } else {
          document.getElementById('form-field-stripe_setup_id').value = stripeSetupId = result.setupIntent.id;
          paymentSuccess.textContent = `Payment successful ${stripeSetupId} ${JSON.stringify(shippingAddress)}`;
        }
      }
      
      try {
        await confirmSetup();
    
        if (paymentSuccess.textContent) {
          originalSendButton.click();
        } else {
          throw new Error('Payment was not successful');
        }
      } catch (error) {
        console.error('Error during payment:', error);
      } finally {
        this.disabled = false;
        this.innerHTML = originalText;
      }
    });

  }

  function onDOMReady(callback) {
    if (['complete', 'interactive'].includes(document.readyState)) {
      callback();
    } else {
      window.addEventListener('DOMContentLoaded', callback);
    }
  }

  function hideElementorInputsInStep(stepAncestor) {
    const stepClass = Array.from(stepAncestor.classList)
      .find(className => className.startsWith('elementor-field-group-field_'));
    const buttonsWrapper = stepAncestor.querySelector('.e-form__buttons');

    if (!stepClass || !buttonsWrapper) {
      console.error('Could not find some elements in the step ancestor.');
      return;
    }

    const buttonsHeight = buttonsWrapper.offsetHeight;
    const currentHeight = stepAncestor.offsetHeight;

    const style = document.createElement('style');
    style.textContent = `
      .${stepClass} {
        min-height: ${Math.round(currentHeight/2.5)}px;
      }
      .${stepClass} .elementor-field-group:not(.e-form__buttons__wrapper) {
        display: none;
      }
      .${stepClass} .e-form__buttons {
        max-height: ${buttonsHeight}px;
      }      
    `;
    document.head.appendChild(style);
  }

  (function injectCarevalidateSpinnerStyles() {
    const styleElement = document.createElement('style');
    styleElement.textContent = `
      .carevalidate-spinner-rotate.eicon-loading::before {
        animation: carevalidate-spin 1s linear infinite;
        display: inline-block;
      }
  
      @keyframes carevalidate-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(styleElement);
  })();

})();
