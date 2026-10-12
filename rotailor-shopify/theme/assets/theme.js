/* RO Tailor Haberdashery — global scripts */
(function () {
  'use strict';

  /* announcement rotator */
  function initRotators(scope) {
    (scope || document).querySelectorAll('[data-rotator]').forEach(function (track) {
      if (track.__rotator) return;
      var items = track.children;
      if (items.length < 2) return;
      var i = 0;
      track.__rotator = setInterval(function () {
        items[i].classList.remove('is-active');
        i = (i + 1) % items.length;
        items[i].classList.add('is-active');
      }, 4500);
    });
  }

  /* tabs (suit pairing) */
  function initTabs(scope) {
    (scope || document).querySelectorAll('[data-tabs]').forEach(function (wrap) {
      var tabs = wrap.querySelectorAll('[role="tab"]');
      tabs.forEach(function (tab, index) {
        tab.addEventListener('click', function () { activate(tab); });
        tab.addEventListener('keydown', function (e) {
          var dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
          if (!dir) return;
          e.preventDefault();
          var next = tabs[(index + dir + tabs.length) % tabs.length];
          next.focus();
          activate(next);
        });
      });
      function activate(tab) {
        tabs.forEach(function (t) {
          var on = t === tab;
          t.classList.toggle('is-active', on);
          t.setAttribute('aria-selected', on ? 'true' : 'false');
          t.tabIndex = on ? 0 : -1;
          var panel = document.getElementById(t.getAttribute('aria-controls'));
          if (panel) panel.hidden = !on;
        });
      }
    });
  }

  /* cart count + toast */
  function refreshCartCount() {
    fetch((window.routes ? window.routes.cart_url : '/cart') + '.js', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        document.querySelectorAll('[data-cart-count]').forEach(function (n) {
          n.textContent = cart.item_count;
          n.hidden = cart.item_count === 0;
        });
      })
      .catch(function () {});
  }

  function toast(message) {
    var t = document.querySelector('[data-cart-toast]');
    if (!t) return;
    t.querySelector('[data-cart-toast-message]').textContent = message;
    t.hidden = false;
    clearTimeout(t.__timer);
    t.__timer = setTimeout(function () { t.hidden = true; }, 4000);
  }

  document.addEventListener('theme:cart:changed', refreshCartCount);

  /* product form: variant selection + ajax add */
  function initProductForms(scope) {
    (scope || document).querySelectorAll('[data-product-form]').forEach(function (form) {
      if (form.__ready) return;
      form.__ready = true;
      var dataEl = form.querySelector('[data-product-json]');
      var variants = dataEl ? JSON.parse(dataEl.textContent) : [];
      var idInput = form.querySelector('input[name="id"]');
      var submit = form.querySelector('[type="submit"]');
      var priceWrap = document.querySelector('[data-price-for="' + form.getAttribute('data-section') + '"]');

      function selectedOptions() {
        return Array.prototype.map.call(form.querySelectorAll('[data-option-index]'), function (fs) {
          var checked = fs.querySelector('input:checked');
          return checked ? checked.value : null;
        });
      }

      function onChange() {
        var opts = selectedOptions();
        var variant = variants.filter(function (v) {
          return v.options.every(function (o, i) { return o === opts[i]; });
        })[0];
        if (!variant) {
          submit.disabled = true;
          submit.textContent = submit.getAttribute('data-unavailable');
          return;
        }
        idInput.value = variant.id;
        submit.disabled = !variant.available;
        submit.textContent = variant.available ? submit.getAttribute('data-add') : submit.getAttribute('data-sold-out');
        if (priceWrap && variant.price_html) priceWrap.innerHTML = variant.price_html;
        var url = new URL(window.location.href);
        url.searchParams.set('variant', variant.id);
        window.history.replaceState({}, '', url.toString());
      }

      form.addEventListener('change', function (e) {
        if (e.target.closest('[data-option-index]')) onChange();
      });

      var qty = form.querySelector('[data-qty]');
      form.querySelectorAll('[data-qty-step]').forEach(function (b) {
        b.addEventListener('click', function () {
          var n = Math.max(1, (parseInt(qty.value, 10) || 1) + parseInt(b.getAttribute('data-qty-step'), 10));
          qty.value = n;
        });
      });

      form.addEventListener('submit', function (e) {
        if (!window.fetch) return;
        e.preventDefault();
        submit.disabled = true;
        fetch(window.routes.cart_add_url + '.js', {
          method: 'POST',
          headers: { Accept: 'application/json' },
          body: new FormData(form)
        })
          .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
          .then(function () {
            refreshCartCount();
            toast(window.themeStrings.addedToCart);
          })
          .catch(function () { toast(window.themeStrings.addError); })
          .finally(function () { submit.disabled = false; });
      });
    });
  }

  /* collection sort */
  function initSort(scope) {
    (scope || document).querySelectorAll('[data-sort]').forEach(function (select) {
      select.addEventListener('change', function () {
        var url = new URL(window.location.href);
        url.searchParams.set('sort_by', select.value);
        url.searchParams.delete('page');
        window.location.href = url.toString();
      });
    });
  }

  /* close mobile drawer on navigation */
  function initDrawer() {
    document.querySelectorAll('[data-drawer]').forEach(function (d) {
      d.addEventListener('click', function (e) {
        if (e.target.closest('a')) d.removeAttribute('open');
      });
      d.addEventListener('toggle', function () {
        document.documentElement.style.overflow = d.open ? 'hidden' : '';
      });
    });
  }

  function init(scope) {
    initRotators(scope);
    initTabs(scope);
    initProductForms(scope);
    initSort(scope);
  }

  document.addEventListener('DOMContentLoaded', function () {
    init();
    initDrawer();
  });
  document.addEventListener('shopify:section:load', function (e) { init(e.target); });
})();
