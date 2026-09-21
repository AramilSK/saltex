/* ══════════════════════════════════════════════════════
   САЛТЕКС — общий скрипт всех страниц.

   Здесь живёт то, что обязано вести себя одинаково
   на главной, в каталоге и в карточке товара:
   курс доллара, арифметика цен, шапка, приветствие
   в мессенджере, модалка прайс-листа, оформление.

   Публичный интерфейс — window.SALTEKS (см. низ файла).
   ══════════════════════════════════════════════════════ */
(function(){
  'use strict';

  /* ══════════════════════════════════════════════════
     НАСТРОЙКИ — всё, что заказчик меняет без программиста
     ══════════════════════════════════════════════════ */
  var CONFIG = {
    /* Телефон быстрого набора в шапке */
    phone:      '+7 (985) 220-13-54',
    phoneHref:  'tel:+79852201354',

    telegram:   'https://t.me/salteksrus',
    max:        'https://max.ru/u/79852201354',

    hours:      'Пн — Пт · 09:00 — 18:00 МСК',

    /* Приветствие, которое видит посетитель до перехода в чат */
    greeting:
      'Здравствуйте! На связи менеджер САЛТЕКС. ' +
      'Подскажем наличие, цену за килограмм и срок отгрузки — ' +
      'напишите, какое полотно вас интересует.',

    /* Текст, который подставляется в сам чат. Telegram принимает его
       только для ботов: у личного аккаунта параметр ?text= игнорируется —
       это ограничение платформы, а не сайта. */
    chatIntro: 'Здравствуйте! Пишу с сайта sal-teks.ru. Интересует'
  };

  /* ── Курс ЦБ + наценка ──
     ЦБ публикует курс раз в сутки, поэтому «реальное время» здесь —
     это свежее значение при каждом открытии страницы и обновление
     раз в TTL, пока вкладка открыта. */
  var FX = {
    ENDPOINT: 'https://www.cbr-xml-daily.ru/daily_json.js',
    MARKUP:   1.05,          /* ЦБ +5% */
    TTL:      30 * 60 * 1000,
    /* Страховка на случай, когда ЦБ недоступен и кэша ещё нет.
       Это база, до наценки: показанный курс = FALLBACK × MARKUP.
       Значение стареет — обновлять при каждой выкладке, иначе
       часть посетителей увидит цены от выдуманного курса.
       Обновлено 21.09.2026 по курсу ЦБ 84,0954. */
    FALLBACK: 84.10,
    KEY:      'saltex-fx'
  };

  var doc = document;
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = matchMedia('(pointer: fine)').matches;

  function esc(s){
    return String(s).replace(/[&<>"]/g, function(ch){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[ch];
    });
  }

  /* ══════════════════════════════════════════════════
     ДЕНЬГИ И РАСЧЁТЫ
     Одни и те же функции для каталога и карточки —
     иначе две страницы разойдутся в копейках.
     ══════════════════════════════════════════════════ */
  var nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits:2, maximumFractionDigits:2 });
  var nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits:0 });
  var nf1 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits:1 });

  /* неразрывный пробел перед знаком валюты: «17 200 ₽» не должно
     переноситься так, чтобы рубль уезжал на следующую строку */
  function rub(v){  return nf2.format(v) + ' ₽'; }
  function rub0(v){ return nf0.format(Math.round(v)) + ' ₽'; }
  function usd(v){  return '$' + v.toFixed(2); }

  /* ── Цена за килограмм: две градации по объёму ──
     В прайсе у большинства позиций две цены — до 250 кг и от 250.
     У трёх позиций вторая не указана: там bulk === null, и объём
     на цену не влияет. Порог берётся из данных, а не зашит: если
     в прайсе он поедет, поменяется только выгрузка. */
  function tier(p, massKg){
    var pr   = p.price || {};
    var base = Number(pr.base) || Number(p.price_usd_kg) || 0;   /* price_usd_kg — старая выгрузка */
    var bulk = pr.bulk == null ? null : Number(pr.bulk);
    var from = Number(pr.bulk_from_kg) || 250;
    var isBulk = bulk != null && massKg >= from;
    return { usd: isBulk ? bulk : base, base: base, bulk: bulk, from: from, isBulk: isBulk };
  }

  /* Все производные цены одной позиции.
     massKg — масса, по которой выбирается градация; без неё берём
     вес рулона, то есть цену «от одного рулона».
     m_per_kg — метров в килограмме, поэтому цена метра это
     цена килограмма, ПОДЕЛЁННАЯ на метраж, а не умноженная. */
  function calc(p, rate, massKg){
    var rollKg = p.roll_kg_avg || 20;
    var mass   = massKg == null ? rollKg : massKg;
    var t      = tier(p, mass);
    var kg     = t.usd * rate;
    return {
      rateUsed: rate,
      usdKg:   t.usd,
      kg:      kg,
      m:       p.m_per_kg ? kg / p.m_per_kg : null,
      rollKg:  rollKg,
      rollM:   p.m_per_kg ? rollKg * p.m_per_kg : null,
      rollRub: kg * rollKg,
      /* для подписи «от 250 кг — дешевле» и переключения градации */
      isBulk:  t.isBulk,
      hasBulk: t.bulk != null,
      bulkFrom: t.from,
      baseRub: t.base * rate,
      bulkRub: t.bulk == null ? null : t.bulk * rate
    };
  }

  /* ══════════════════════════════════════════════════
     КУРС ДОЛЛАРА
     ══════════════════════════════════════════════════ */
  var fxState = { rate:FX.FALLBACK, base:null, date:null, ok:false };
  var fxWaiters = [];

  function fxRead(){
    try {
      var raw = localStorage.getItem(FX.KEY);
      if (!raw) return null;
      var v = JSON.parse(raw);
      if (!v || typeof v.rate !== 'number' || !isFinite(v.rate) || v.rate <= 0) return null;
      return v;
    } catch(e){ return null; }
  }

  function fxWrite(v){
    try { localStorage.setItem(FX.KEY, JSON.stringify(v)); } catch(e){}
  }

  function fxApply(v, fresh){
    fxState = { rate:v.rate, base:v.base, date:v.date, ok:true };
    fxRender(fresh);
    var list = fxWaiters.slice();
    fxWaiters.length = 0;
    list.forEach(function(cb){ try { cb(fxState.rate); } catch(e){} });
    doc.dispatchEvent(new CustomEvent('saltex:fx', { detail:fxState }));
  }

  function fxRender(fresh){
    var box = doc.getElementById('fx');
    if (!box) return;
    var val = box.querySelector('.fx__value');
    var note = box.querySelector('.fx__note');
    if (val) val.textContent = '$ = ' + nf2.format(fxState.rate) + ' ₽';

    box.hidden = false;
    box.classList.toggle('is-stale', !fxState.ok);

    if (fxState.ok) {
      if (note) note.textContent = 'ЦБ +5%';
      var when = fxState.date ? new Date(fxState.date) : null;
      box.title = 'Курс ЦБ РФ' +
        (fxState.base ? ' (' + nf2.format(fxState.base) + ' ₽)' : '') +
        (when && !isNaN(when) ? ' на ' + when.toLocaleDateString('ru-RU') : '') +
        ' плюс 5%. По этому курсу пересчитаны цены в каталоге.';
    } else {
      if (note) note.textContent = 'курс уточняется';
      box.title = 'Не удалось получить курс ЦБ. Показано ориентировочное значение — ' +
                  'точную цену уточняйте у менеджера.';
    }

    if (fresh && !reduced) {
      box.classList.remove('is-fresh');
      void box.offsetWidth;             /* перезапуск анимации */
      box.classList.add('is-fresh');
    }
  }

  function fxFetch(){
    if (!window.fetch) return;
    fetch(FX.ENDPOINT, { cache:'no-store' })
      .then(function(r){ if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function(d){
        var base = d && d.Valute && d.Valute.USD && d.Valute.USD.Value;
        if (typeof base !== 'number' || !isFinite(base) || base <= 0) throw new Error('нет курса');
        var v = {
          rate: Math.round(base * FX.MARKUP * 100) / 100,
          base: base,
          date: d.Date || null,
          ts:   Date.now()
        };
        fxWrite(v);
        fxApply(v, true);
      })
      .catch(function(){
        /* сеть недоступна — остаётся то, что уже показано:
           либо кэш, либо страховочное значение */
        fxRender(false);
      });
  }

  function fxInit(){
    var cached = fxRead();
    if (cached) {
      fxApply(cached, false);
      if (Date.now() - (cached.ts || 0) < FX.TTL) return;   /* свежий кэш — не дёргаем ЦБ */
    } else {
      fxRender(false);   /* показываем страховочное значение, помеченное как неточное */
    }
    fxFetch();

    setInterval(function(){
      if (!doc.hidden) fxFetch();
    }, FX.TTL);

    doc.addEventListener('visibilitychange', function(){
      var c = fxRead();
      if (!doc.hidden && (!c || Date.now() - (c.ts || 0) > FX.TTL)) fxFetch();
    });
  }

  /* Отдаёт курс сразу, если он уже есть, иначе дожидается ответа ЦБ.
     Каталог рисует цифры только после этого, чтобы не мигать цифрами. */
  function onRate(cb){
    if (fxState.ok) { cb(fxState.rate); return; }
    fxWaiters.push(cb);
    /* если ЦБ не ответит — через 4 с рисуем по страховочному курсу,
       пустой каталог хуже приблизительных цен */
    setTimeout(function(){
      var i = fxWaiters.indexOf(cb);
      if (i !== -1) { fxWaiters.splice(i,1); cb(fxState.rate); }
    }, 4000);
  }

  /* ══════════════════════════════════════════════════
     ШАПКА
     ══════════════════════════════════════════════════ */
  function initHeader(){
    var burger = doc.getElementById('burger');
    var nav = doc.getElementById('nav');
    if (burger && nav) {
      burger.addEventListener('click', function(){
        var open = nav.classList.toggle('is-open');
        burger.setAttribute('aria-expanded', String(open));
      });
      /* переход по ссылке закрывает панель — иначе на якорях главной
         меню остаётся раскрытым поверх контента */
      nav.addEventListener('click', function(e){
        if (e.target.closest('a')) {
          nav.classList.remove('is-open');
          burger.setAttribute('aria-expanded', 'false');
        }
      });
    }

    /* Подсветка текущего раздела. data-nav отделён от data-page:
       карточка товара — своя страница, но в меню светится «Каталог». */
    var here = doc.body.dataset.nav || doc.body.dataset.page;
    if (here && nav) {
      var link = nav.querySelector('[data-nav-id="' + here + '"]');
      if (link) link.setAttribute('aria-current', 'page');
    }

    /* телефон в шапке и в подвале берётся из CONFIG */
    doc.querySelectorAll('[data-phone]').forEach(function(el){
      if (el.tagName === 'A') el.href = CONFIG.phoneHref;
      var num = el.querySelector('.btn-icon__num') || el;
      num.textContent = CONFIG.phone;
    });
  }

  /* ══════════════════════════════════════════════════
     ССЫЛКИ В ЧАТ
     Прямой переход: клик по иконке сразу открывает чат.
     Адреса берутся из CONFIG, чтобы не править их
     на четырёх страницах по отдельности.
     ══════════════════════════════════════════════════ */
  function chatLink(base, subject){
    var text = CONFIG.chatIntro + (subject ? ' ' + subject : ' трикотажное полотно.');
    /* ?text= читает только Telegram и только для ботов; для остальных
       ссылка просто открывает чат — лишнего параметра там не видно */
    return base + (base.indexOf('?') === -1 ? '?' : '&') + 'text=' + encodeURIComponent(text);
  }

  function initChats(){
    doc.querySelectorAll('[data-chat]').forEach(function(a){
      a.href = a.dataset.chat === 'tg' ? chatLink(CONFIG.telegram) : CONFIG.max;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    });
  }

  /* ══════════════════════════════════════════════════
     МОДАЛКА «ПОЛУЧИТЬ ПРАЙС-ЛИСТ» — три поля
     ══════════════════════════════════════════════════ */
  var lead = {};

  function initLead(){
    if (doc.getElementById('lead')) return;

    var dlg = doc.createElement('dialog');
    dlg.className = 'modal';
    dlg.id = 'lead';
    dlg.innerHTML =
      '<div class="modal__inner">' +
        '<button class="modal__close" type="button" data-lead-close aria-label="Закрыть">&times;</button>' +
        '<p class="modal__kicker">Прайс-лист</p>' +
        '<h2 class="modal__title" id="lead-title">Получить прайс-лист</h2>' +
        '<p class="modal__text">Пришлём актуальный прайс с&nbsp;ценами за&nbsp;килограмм и&nbsp;остатками по&nbsp;складу. Обычно отвечаем в&nbsp;течение часа в&nbsp;рабочее время.</p>' +
        '<p class="modal__subject" id="lead-subject" hidden></p>' +
        '<form id="lead-form" novalidate>' +
          '<div class="mfield"><label for="lead-name">Ваше имя <span>*</span></label>' +
            '<input id="lead-name" name="name" type="text" autocomplete="name" placeholder="Как к вам обращаться"></div>' +
          '<div class="mfield"><label for="lead-phone">Телефон <span>*</span></label>' +
            '<input id="lead-phone" name="phone" type="tel" autocomplete="tel" placeholder="+7 (___) ___-__-__"></div>' +
          '<div class="mfield"><label for="lead-email">E-mail <span>*</span></label>' +
            '<input id="lead-email" name="email" type="email" autocomplete="email" placeholder="you@company.ru"></div>' +
          /* Telegram — по желанию: многие оптовики отвечают там быстрее,
             чем на почту, но требовать его нельзя. */
          '<div class="mfield"><label for="lead-tg">Telegram <span class="mfield__opt">— если удобнее там</span></label>' +
            '<input id="lead-tg" name="tg" type="text" autocomplete="username" placeholder="@username или телефон"></div>' +
          '<label class="modal__agree" id="lead-agree-box">' +
            '<input id="lead-agree" name="agree" type="checkbox">' +
            '<span>Я соглашаюсь с <a href="#" rel="nofollow">Политикой конфиденциальности</a> и обработкой персональных данных</span>' +
          '</label>' +
          '<button class="btn btn--ochre btn--wide" type="submit"><span>Отправить запрос</span></button>' +
        '</form>' +
        '<p class="modal__status" id="lead-status" role="status" aria-live="polite"></p>' +
      '</div>';
    doc.body.appendChild(dlg);

    var form    = doc.getElementById('lead-form');
    var status  = doc.getElementById('lead-status');
    var subject = doc.getElementById('lead-subject');
    var agreeBox= doc.getElementById('lead-agree-box');

    function bad(el, on){
      var f = el.closest('.mfield') || el.closest('.modal__agree');
      if (f) f.classList.toggle('is-bad', !!on);
    }

    lead.open = function(subjectText, titleText){
      dlg.classList.remove('is-sent');
      status.classList.remove('is-on');
      status.textContent = '';
      form.querySelectorAll('.is-bad').forEach(function(f){ f.classList.remove('is-bad'); });

      doc.getElementById('lead-title').textContent = titleText || 'Получить прайс-лист';
      subject.hidden = !subjectText;
      subject.textContent = subjectText || '';
      dlg.dataset.subject = subjectText || '';

      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');       /* очень старые браузеры */
      /* Модалка живёт в top layer — он выше любого z-index, и наши
         ножницы под ним не видны. Пока окно открыто, возвращаем
         системный курсор. */
      doc.documentElement.classList.add('is-modal');
      setTimeout(function(){ doc.getElementById('lead-name').focus(); }, 60);
    };

    /* close срабатывает и на Esc, и на клик по крестику, и на подложку */
    dlg.addEventListener('close', function(){
      doc.documentElement.classList.remove('is-modal');
    });

    dlg.addEventListener('click', function(e){
      if (e.target.closest('[data-lead-close]')) { dlg.close(); return; }
      /* клик по подложке: цель — сам <dialog>, а не его содержимое */
      if (e.target === dlg) dlg.close();
    });

    /* Через form.elements, а не form.name: у формы есть собственное
       свойство name (атрибут), и оно перекрывает поле с тем же именем. */
    var f = form.elements;

    form.addEventListener('submit', function(e){
      e.preventDefault();
      var name  = f.name.value.trim();
      var phone = f.phone.value.trim();
      var email = f.email.value.trim();
      var agree = f.agree.checked;

      var digits = phone.replace(/\D/g, '').length;
      var mailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);

      bad(f.name,  !name);
      bad(f.phone, digits < 10);
      bad(f.email, !mailOk);
      agreeBox.classList.toggle('is-bad', !agree);

      if (!name)          { status.textContent = 'Представьтесь, пожалуйста — без имени неудобно отвечать.'; }
      else if (digits<10) { status.textContent = 'Проверьте номер — кажется, в нём не хватает цифр.'; }
      else if (!mailOk)   { status.textContent = 'Проверьте адрес почты — прайс уходит письмом.'; }
      else if (!agree)    { status.textContent = 'Нужно согласие на обработку персональных данных.'; }
      else {
        /* ЗАГЛУШКА: бэкенда нет. Сюда встаёт отправка на почту или в CRM.
           В заявку уходят: name, phone, email, tg (необязательно),
           subject (артикул или тема) и содержимое корзины, если есть. */
        var tg = f.tg.value.trim();
        status.textContent = 'Готово, ' + name + '. Ответим на ' + email +
          (tg ? ' и в Telegram ' + tg : '') + ' в течение часа в рабочее время.';
        status.classList.add('is-on');
        dlg.classList.add('is-sent');
        if (typeof lead.onSent === 'function') lead.onSent();
        return;
      }
      status.classList.add('is-on');
    });

    /* Любая кнопка с data-lead открывает модалку.
       Значение атрибута — тема заявки (артикул, название ткани). */
    doc.addEventListener('click', function(e){
      var t = e.target.closest('[data-lead]');
      if (!t) return;
      e.preventDefault();
      lead.open(t.dataset.lead || '', t.dataset.leadTitle || '');
    });
  }

  /* ══════════════════════════════════════════════════
     КОРЗИНА
     Хранит только артикул и вес в килограммах: цены
     считаются на лету по текущему курсу, иначе в корзине
     зависли бы рубли позавчерашнего дня.
     ══════════════════════════════════════════════════ */
  var cart = (function(){
    var KEY = 'saltex-cart';
    var items = [];
    var subs = [];

    function read(){
      try {
        var raw = JSON.parse(localStorage.getItem(KEY) || '[]');
        if (!Array.isArray(raw)) return [];
        return raw
          .filter(function(r){ return r && typeof r.id === 'string' && Number(r.kg) > 0; })
          .map(function(r){
            return {
              id: r.id,
              kg: Math.round(Number(r.kg)),
              /* цвет необязателен: позицию можно положить и без него,
                 тогда его согласуют с менеджером по карте */
              color: typeof r.color === 'string' ? r.color : ''
            };
          });
      } catch(e){ return []; }
    }

    function write(){
      try { localStorage.setItem(KEY, JSON.stringify(items)); } catch(e){}
      subs.forEach(function(cb){ try { cb(items); } catch(e){} });
      paintBadge();
      /* корзина открыта во второй вкладке — там тоже обновится */
      doc.dispatchEvent(new CustomEvent('saltex:cart', { detail:items.slice() }));
    }

    function find(id){
      for (var i = 0; i < items.length; i++) if (items[i].id === id) return i;
      return -1;
    }

    function paintBadge(){
      var n = items.length;
      doc.querySelectorAll('[data-cart-count]').forEach(function(el){
        el.textContent = n;
        el.hidden = n === 0;
      });
      doc.querySelectorAll('.btn-icon--cart').forEach(function(el){
        el.classList.toggle('is-filled', n > 0);
        el.setAttribute('aria-label', n
          ? 'Корзина: ' + n + ' ' + plural(n, 'позиция', 'позиции', 'позиций')
          : 'Корзина пуста');
      });
    }

    function plural(n, one, few, many){
      var d10 = n % 10, d100 = n % 100;
      if (d10 === 1 && d100 !== 11) return one;
      if (d10 >= 2 && d10 <= 4 && (d100 < 10 || d100 >= 20)) return few;
      return many;
    }

    return {
      init: function(){
        items = read();
        paintBadge();
        /* другая вкладка изменила корзину — подхватываем */
        addEventListener('storage', function(e){
          if (e.key !== KEY) return;
          items = read();
          paintBadge();
          subs.forEach(function(cb){ try { cb(items); } catch(err){} });
        });
      },
      items:  function(){ return items.slice(); },
      count:  function(){ return items.length; },
      has:    function(id){ return find(id) !== -1; },
      qty:    function(id){ var i = find(id); return i === -1 ? 0 : items[i].kg; },
      /* повторное добавление той же позиции прибавляет вес,
         а не заводит вторую строку */
      /* Строка одна на артикул. Если ту же ткань кладут второй раз
         в другом цвете, вес складывается, а цвет берётся последний
         выбранный — две строки на один артикул завели бы путаницу
         в счётчике и в заявке. */
      add: function(id, kg, color){
        var i = find(id);
        if (i === -1) items.push({ id:id, kg:Math.max(1, Math.round(kg)), color:color || '' });
        else {
          items[i].kg += Math.max(1, Math.round(kg));
          if (color) items[i].color = color;
        }
        write();
      },
      colorOf: function(id){ var i = find(id); return i === -1 ? '' : (items[i].color || ''); },
      setQty: function(id, kg){
        var i = find(id);
        if (i === -1) return;
        if (kg > 0) items[i].kg = Math.round(kg); else items.splice(i, 1);
        write();
      },
      remove: function(id){
        var i = find(id);
        if (i !== -1) { items.splice(i, 1); write(); }
      },
      clear:  function(){ items = []; write(); },
      onChange: function(cb){ subs.push(cb); },
      plural: plural
    };
  })();

  /* ══════════════════════════════════════════════════
     СОГЛАСИЕ НА COOKIE
     ══════════════════════════════════════════════════ */
  function initCookies(pre){
    var box = doc.getElementById('cookies');
    if (!box) return;
    var choice = null;
    try { choice = localStorage.getItem('saltex-cookies'); } catch(e){}
    if (choice) return;

    box.hidden = false;
    var preActive = pre && !pre.classList.contains('is-skipped');
    setTimeout(function(){ box.classList.add('is-in'); }, preActive ? 2500 : 900);

    box.addEventListener('click', function(e){
      var b = e.target.closest('[data-cookie]');
      if (!b) return;
      try { localStorage.setItem('saltex-cookies', b.dataset.cookie); } catch(err){}
      box.classList.remove('is-in');
      setTimeout(function(){ box.hidden = true; }, 750);
    });
  }

  /* ══════════════════════════════════════════════════
     ПОЯВЛЕНИЕ БЛОКОВ
     ══════════════════════════════════════════════════ */
  var io = null;
  function initRise(){
    if (reduced || !('IntersectionObserver' in window)) {
      doc.querySelectorAll('.rise').forEach(function(el){ el.classList.add('is-in'); });
      return;
    }
    io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { rootMargin:'0px 0px -10% 0px', threshold:.08 });
    doc.querySelectorAll('.rise').forEach(function(el){ io.observe(el); });
  }

  /* Блоки, которые появились после загрузки (карточки каталога),
     нужно поставить под наблюдение отдельно. */
  function observe(root){
    var els = (root || doc).querySelectorAll('.rise:not(.is-in)');
    if (!io) { els.forEach(function(el){ el.classList.add('is-in'); }); return; }
    els.forEach(function(el){ io.observe(el); });
  }

  /* ══════════════════════════════════════════════════
     ПРЕЛОАДЕР
     ══════════════════════════════════════════════════ */
  function initPreloader(){
    var pre = doc.getElementById('preloader');
    if (!pre) return null;
    if (pre.classList.contains('is-skipped')) {
      doc.documentElement.classList.remove('is-loading');
      return pre;
    }

    var pct = doc.getElementById('pre-pct');
    var bar = doc.getElementById('pre-bar');
    var DURATION = 1600;
    var start = performance.now();
    var finished = false;

    function finish(){
      if (finished) return;
      finished = true;
      pre.classList.add('is-done');
      doc.documentElement.classList.remove('is-loading');
      try { sessionStorage.setItem('saltex-preloaded','1'); } catch(e){}
      setTimeout(function(){ pre.classList.add('is-skipped'); }, 700);
    }

    (function tick(now){
      var t = Math.min((now - start) / DURATION, 1);
      var eased = 1 - Math.pow(1 - t, 3);      /* easeOutCubic */
      var value = Math.round(eased * 100);
      if (pct) pct.textContent = value < 10 ? '0' + value : value;
      if (bar) bar.style.width = eased * 100 + '%';
      if (t < 1) requestAnimationFrame(tick);
      else setTimeout(finish, 260);
    })(start);

    return pre;
  }

  /* ══════════════════════════════════════════════════
     КУРСОР-НОЖНИЦЫ
     ══════════════════════════════════════════════════ */
  function initCursor(){
    var cursor = doc.getElementById('cursor');
    if (!cursor || !fine || reduced) return;
    doc.documentElement.classList.add('has-cursor');

    /* Яркость фона под остриём. Поднимаемся по дереву, пока не найдём
       непрозрачную заливку: у большинства элементов фон прозрачный,
       и цвет на самом деле задаёт предок. */
    function bgLuminance(el){
      while (el && el !== doc.documentElement) {
        var bg = getComputedStyle(el).backgroundColor;
        var m = bg && bg.match(/rgba?\(([^)]+)\)/);
        if (m) {
          var p = m[1].split(',').map(parseFloat);
          var alpha = p.length > 3 ? p[3] : 1;
          if (alpha > 0.35) {
            /* воспринимаемая яркость по коэффициентам ITU-R BT.601 */
            return (p[0] * 0.299 + p[1] * 0.587 + p[2] * 0.114) / 255;
          }
        }
        el = el.parentElement;
      }
      return 1;
    }

    var tx = -120, ty = -120, cx = -120, cy = -120;
    var light = false;

    /* Над полями и списками ножницы уступают место системному курсору:
       раскрытый <select> рисует система поверх страницы, и наш курсор
       под ним всё равно не виден — пусть работает обычный.

       iframe в этом списке обязателен. Внутри чужого фрейма (карта)
       mousemove до нас не доходит: ножницы замирают на границе и
       висят поверх карты вторым курсором рядом с настоящим. */
    var NATIVE = 'select, option, input, textarea, iframe';

    window.addEventListener('mousemove', function(e){
      tx = e.clientX; ty = e.clientY;
      var el = doc.elementFromPoint(e.clientX, e.clientY);

      cursor.classList.toggle('is-hidden', !!(el && el.closest(NATIVE)));

      /* порог 0.5: охра (яркость ≈0.56) остаётся под чёрными ножницами,
         чёрный и антрацит переключают их в белые */
      var wantLight = el ? bgLuminance(el) < 0.5 : false;
      if (wantLight !== light) { light = wantLight; cursor.classList.toggle('is-light', light); }
    }, { passive:true });

    doc.addEventListener('mouseleave', function(){ cursor.classList.add('is-hidden'); });
    doc.addEventListener('mouseenter', function(){ cursor.classList.remove('is-hidden'); });
    doc.addEventListener('mousedown', function(){ cursor.classList.add('is-cut'); });
    doc.addEventListener('mouseup',   function(){
      setTimeout(function(){ cursor.classList.remove('is-cut'); }, 90);
    });

    function lerp(a, b, k){ return a + (b - a) * k; }
    (function frame(){
      cx = lerp(cx, tx, .34);
      cy = lerp(cy, ty, .34);
      cursor.style.transform = 'translate3d(' + cx.toFixed(2) + 'px,' + cy.toFixed(2) + 'px,0)';
      requestAnimationFrame(frame);
    })();

    cursor.classList.add('is-hidden');
    window.addEventListener('mousemove', function once(){
      cursor.classList.remove('is-hidden');
      /* класс вешаем следующим кадром: если сделать это сразу, браузер
         объединит оба изменения в одну перерисовку и штрих не анимируется */
      requestAnimationFrame(function(){ cursor.classList.add('is-drawn'); });
      window.removeEventListener('mousemove', once);
    }, { once:true });
  }

  /* ══════════════════════════════════════════════════
     РАЗРЕЗАЕМЫЕ ЛИНИИ
     Щелчок по горизонтальной линейке рассекает её: концы
     расходятся и провисают, через паузу срастаются.
     ══════════════════════════════════════════════════ */
  function initCutlines(){
    if (reduced) return;
    var CUTTABLE = '.rule, .perk, .figures > div, .contacts__list > div, .hero__meta, .colophon, .cat__bar, .crumbs';
    var NS = 'http://www.w3.org/2000/svg';
    var TOLERANCE = 10;
    var DROP = 480, HOLD = 1900, HEAL = 780;

    function easeOut(t){ return 1 - Math.pow(1 - t, 3); }
    function easeInOut(t){ return t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2; }

    function shape(cutX, W, sag){
      var gap = sag * 0.22;
      var lx = Math.max(0, cutX - gap), rx = Math.min(W, cutX + gap);
      return [
        'M0 0 C' + (cutX * .55).toFixed(1) + ' 0,' +
                   (cutX * .84).toFixed(1) + ' ' + (sag * .28).toFixed(2) + ',' +
                   lx.toFixed(1) + ' ' + sag.toFixed(2),
        'M' + rx.toFixed(1) + ' ' + (sag * .94).toFixed(2) +
        ' C' + (rx + (W - rx) * .16).toFixed(1) + ' ' + (sag * .26).toFixed(2) + ',' +
               (rx + (W - rx) * .46).toFixed(1) + ' 0,' + W.toFixed(1) + ' 0'
      ];
    }

    function cut(el, edge, color, width, cutX){
      var W = el.getBoundingClientRect().width;
      cutX = Math.max(8, Math.min(W - 8, cutX));
      var depth = 10 + Math.random() * 6;

      el.dataset.cut = '1';
      el.classList.add('is-cutting');
      el.style[edge === 'top' ? 'borderTopColor' : 'borderBottomColor'] = 'transparent';

      var svg = doc.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'cutline');
      svg.setAttribute('viewBox', '0 0 ' + W + ' 60');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('aria-hidden', 'true');
      svg.style.top = edge === 'top' ? '0' : '100%';

      var seg = [0, 1].map(function(){
        var p = doc.createElementNS(NS, 'path');
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke', color);
        p.setAttribute('stroke-width', width);
        p.setAttribute('stroke-linecap', 'round');
        /* без этого растяжение viewBox по ширине раздавило бы толщину штриха */
        p.setAttribute('vector-effect', 'non-scaling-stroke');
        svg.appendChild(p);
        return p;
      });

      function draw(sag){
        var d = shape(cutX, W, sag);
        seg[0].setAttribute('d', d[0]);
        seg[1].setAttribute('d', d[1]);
      }
      draw(0);
      el.appendChild(svg);

      var t0 = performance.now();
      (function frame(now){
        var e = now - t0;
        if (e < DROP) { draw(easeOut(e / DROP) * depth); requestAnimationFrame(frame); }
        else if (e < DROP + HOLD) { draw(depth); requestAnimationFrame(frame); }
        else if (e < DROP + HOLD + HEAL) {
          draw(depth * (1 - easeInOut((e - DROP - HOLD) / HEAL)));
          requestAnimationFrame(frame);
        } else {
          svg.remove();
          el.classList.remove('is-cutting');
          el.style[edge === 'top' ? 'borderTopColor' : 'borderBottomColor'] = '';
          delete el.dataset.cut;
        }
      })(t0);
    }

    doc.addEventListener('click', function(e){
      var el = e.target.closest(CUTTABLE);
      if (!el || el.dataset.cut) return;
      var cs = getComputedStyle(el);
      var r = el.getBoundingClientRect();
      var topW = parseFloat(cs.borderTopWidth) || 0;
      var botW = parseFloat(cs.borderBottomWidth) || 0;
      if (topW && Math.abs(e.clientY - r.top) <= TOLERANCE) {
        cut(el, 'top', cs.borderTopColor, topW, e.clientX - r.left);
      } else if (botW && Math.abs(e.clientY - r.bottom) <= TOLERANCE) {
        cut(el, 'bottom', cs.borderBottomColor, botW, e.clientX - r.left);
      }
    });
  }

  /* ── Клавиша G открывает 12-колоночную сетку ── */
  function initGridKey(){
    var overlay = doc.querySelector('.grid-overlay');
    if (!overlay) return;
    doc.addEventListener('keydown', function(e){
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(doc.activeElement.tagName)) return;
      if (e.key === 'g' || e.key === 'G' || e.key === 'п' || e.key === 'П') overlay.classList.toggle('is-on');
    });
  }

  /* ══════════════════════════════════════════════════
     ЗАПУСК
     ══════════════════════════════════════════════════ */
  var pre = initPreloader();
  initHeader();
  fxInit();
  initChats();
  initLead();
  cart.init();
  initCookies(pre);
  initRise();
  initCursor();
  initCutlines();
  initGridKey();

  /* Публичный интерфейс для catalog.js и product.js */
  window.SALTEKS = {
    config:  CONFIG,
    rate:    function(){ return fxState.rate; },
    rateOk:  function(){ return fxState.ok; },
    onRate:  onRate,
    calc:    calc,
    rub:     rub,
    rub0:    rub0,
    usd:     usd,
    num0:    function(v){ return nf0.format(v); },
    num1:    function(v){ return nf1.format(v); },
    esc:     esc,
    observe: observe,
    cart:    cart,
    openLead:function(subject, title){ if (lead.open) lead.open(subject, title); },
    /* корзина вешает сюда обработчик, чтобы очиститься после заявки */
    onLeadSent:function(cb){ lead.onSent = cb; },
    reduced: reduced
  };
})();
