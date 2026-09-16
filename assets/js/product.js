/* ══════════════════════════════════════════════════════
   САЛТЕКС — карточка товара.

   Открывается как product.html?id=<артикул>. Показывает
   характеристики позиции, остальные цвета этого же полотна
   и калькулятор: цена за кг, за метр, метраж и цена рулона,
   всё по курсу ЦБ +5% из шапки.
   ══════════════════════════════════════════════════════ */
(function(){
  'use strict';

  var S = window.SALTEKS;
  var C = window.SALTEKS_CATALOG;
  if (!S || !C) return;

  var root  = document.getElementById('prod');
  var fail  = document.getElementById('fail');
  if (!root) return;

  var id = new URLSearchParams(location.search).get('id') || '';
  /* Выбранный оттенок. Приходит из адреса при переходе с цветовой
     карты, дальше правится кликом по палитре в самой карточке. */
  var color = new URLSearchParams(location.search).get('color') || '';

  /* Текущее состояние калькулятора живёт здесь: пересчёт
     дёргается и из select, и из события смены курса. */
  var current = null;
  var mass = 0;

  /* Цвет у типа больше не хранится: до съёмки — нейтральная фактура */
  function texture(){
    return '<div class="fabric-tex"></div>';
  }

  function specRow(dt, dd){
    return '<div><dt>' + S.esc(dt) + '</dt><dd>' + S.esc(dd) + '</dd></div>';
  }

  function render(data, p){
    /* ── Хлебные крошки ── */
    var crumbs = document.getElementById('crumbs');
    if (crumbs) {
      crumbs.innerHTML =
        '<a href="index.html">Главная</a><span aria-hidden="true">/</span>' +
        '<a href="catalog.html">Каталог</a><span aria-hidden="true">/</span>' +
        '<a href="catalog.html?type=' + encodeURIComponent(p.type) + '">' + S.esc(p.typeName) + '</a>' +
        '<span aria-hidden="true">/</span>' +
        '<span aria-current="page">' + S.esc(p.densityLabel) + ' г/м²</span>';
    }

    document.title = p.name + ' · САЛТЕКС';

    /* ── Фото ──
       Первый кадр — главный, остальные миниатюрами под ним.
       У позиции без съёмки остаётся нейтральная фактура,
       миниатюры не рисуем. */
    var shot = document.getElementById('shot');
    var thumbs = document.getElementById('thumbs');
    var gallery = (C.PHOTOS && p.photos && p.photos.length) ? p.photos : [];

    function showShot(i){
      shot.innerHTML = texture() +
        '<img src="' + S.esc(gallery[i]) + '" alt="' + S.esc(p.name) + '" decoding="async">';
      if (thumbs) thumbs.querySelectorAll('button').forEach(function(b, n){
        b.setAttribute('aria-pressed', String(n === i));
      });
    }

    if (gallery.length) {
      if (thumbs) {
        thumbs.innerHTML = gallery.length > 1
          ? gallery.map(function(src, n){
              return '<button type="button" aria-label="Фото ' + (n + 1) + '" aria-pressed="false">' +
                     '<img src="' + S.esc(src) + '" alt="" loading="lazy" decoding="async"></button>';
            }).join('')
          : '';
        thumbs.hidden = gallery.length < 2;
        thumbs.addEventListener('click', function(e){
          var b = e.target.closest('button');
          if (!b) return;
          showShot(Array.prototype.indexOf.call(thumbs.children, b));
        });
      }
      showShot(0);
    } else {
      shot.innerHTML = texture();
      if (thumbs) thumbs.hidden = true;
    }

    /* ── Заголовок ── */
    document.getElementById('title').textContent = p.name;
    var sub = document.getElementById('sub');
    sub.innerHTML = S.esc(p.typeName) + ' · арт. ' + S.esc(p.sku || p.id);

    /* ── Характеристики ──
       Строки, которых нет в прайсе, не показываем прочерком:
       пустая строка в таблице читается как «данных нет», а это
       ровно то, что мы не хотим говорить о товаре. */
    var rows = [
      ['Ткань',         p.typeName],
      ['Состав',        p.composition],
      ['Качество',      p.quality],
      ['Плотность',     p.densityLabel + ' г/м²'],
      ['Ширина',        p.width === '—' ? null : p.width + ' см'],
      ['Отгрузка',      p.form === 'пачка' ? 'пачками' : 'рулонами'],
      ['Метров в 1 кг', p.mPerKg ? S.num1(p.mPerKg) : null],
      ['Артикул',       p.sku || p.id]
    ];
    document.getElementById('spec').innerHTML = rows
      .filter(function(r){ return r[1] && r[1] !== '—'; })
      .map(function(r){ return specRow(r[0], r[1]); })
      .join('');

    /* ── Цвет ──
       Палитра общая для всего каталога: любое полотно красится
       в любой оттенок карты. Поэтому здесь не «другие цвета этой
       ткани», а вся карта с отметкой выбранного.
       Оттенок может прийти из адреса — так работает переход
       с цветовой карты на главной. */
    var box = document.getElementById('colors');
    var sw  = document.getElementById('swatches');
    var pickLabel = document.getElementById('colors-pick');
    var moreBtn = document.getElementById('colors-more');
    var palette = (window.SALTEKS_COLORS && window.SALTEKS_COLORS.colors) || [];
    var SHOWN = 16;      /* сколько оттенков видно до «показать ещё» */

    if (box && sw && palette.length) {
      var wanted = new URLSearchParams(location.search).get('color') || '';

      sw.innerHTML = palette.map(function(c){
        return '<button class="prod__sw" type="button"' +
               ' data-code="' + S.esc(c.k) + '"' +
               ' data-num="' + S.esc(c.p) + '"' +
               ' style="background:' + S.esc(c.h) + '"' +
               (c.k === wanted ? ' aria-pressed="true"' : ' aria-pressed="false"') +
               ' title="№ ' + S.esc(c.p) + ' · Pantone ' + S.esc(c.k) + '">' +
               '<span class="vh">№ ' + S.esc(c.p) + ', Pantone ' + S.esc(c.k) + '</span></button>';
      }).join('');

      /* Номер в палитре компании по коду пантона: в адресе и в
         корзине ездит код, а показать нужно и номер. */
      function numOf(code){
        for (var i = 0; i < palette.length; i++) {
          if (palette[i].k === code) return palette[i].p;
        }
        return '';
      }

      document.getElementById('colors-count').textContent = palette.length;

      function paintPick(){
        var num = color ? numOf(color) : '';
        pickLabel.textContent = color
          ? 'Выбран № ' + num + ' · ' + color
          : 'Цвет не выбран';
        pickLabel.classList.toggle('is-set', !!color);
      }
      paintPick();

      sw.addEventListener('click', function(e){
        var b = e.target.closest('.prod__sw');
        if (!b) return;
        /* повторный клик по выбранному снимает выбор: цвет
           необязателен, его можно согласовать и с менеджером */
        var next = b.getAttribute('aria-pressed') === 'true' ? '' : b.dataset.code;
        sw.querySelectorAll('.prod__sw').forEach(function(o){
          o.setAttribute('aria-pressed', String(o.dataset.code === next && next !== ''));
        });
        color = next;
        paintPick();
      });

      if (moreBtn) {
        moreBtn.hidden = palette.length <= SHOWN;

        /* Пришли с цветовой карты, а выбранный оттенок оказался
           за пределами первых шестнадцати — раскрываем палитру
           сразу, иначе человек не видит того, что сам выбрал. */
        var pickedAt = -1;
        palette.forEach(function(c, n){ if (c.k === wanted) pickedAt = n; });
        if (pickedAt >= SHOWN) box.classList.add('is-open');

        function labelMore(){
          moreBtn.textContent = box.classList.contains('is-open')
            ? 'Свернуть'
            : 'Показать ещё ' + (palette.length - SHOWN);
        }
        labelMore();

        moreBtn.addEventListener('click', function(){
          box.classList.toggle('is-open');
          labelMore();
        });
      }
    } else if (box) {
      box.hidden = true;
    }

    /* ── Калькулятор ── */
    var sel = document.getElementById('mass');
    var own = document.getElementById('mass-own');
    var ownRow = document.getElementById('mass-own-row');
    var roll = p.roll_kg_avg;

    /* Шаг — вес рулона из прайса: клиент считает партию рулонами,
       а не абстрактными килограммами. Подпись берётся из самого
       множителя, а не из позиции в списке — иначе «110 кг»
       подписывалось как «4 рул.», хотя это пять рулонов.

       Часть полотна отгружается пачками, а не рулонами: у таких
       позиций в прайсе ширина записана как «60*2 (пачка)».
       Формулировки меняются вместе с формой отгрузки (ТЗ 2.3). */
    var pack = p.form === 'пачка';
    var one  = pack ? ' (пачка)' : ' (рулон)';
    var many = pack ? ' пач.' : ' рул.';

    var ROLLS = [1, 2, 3, 5, 10];
    sel.innerHTML = ROLLS.map(function(n){
      return '<option value="' + (roll * n) + '">' +
             S.num0(roll * n) + ' кг' +
             (n === 1 ? one : ' (' + n + many + ')') +
             '</option>';
    }).join('') + '<option value="own">Свой вес…</option>';

    /* Подписи строк калькулятора: «метров в рулоне» для пачки —
       неправда, там метраж считается по пачке. */
    var rowM    = document.getElementById('c-rollm');
    var rowCost = document.getElementById('c-roll');
    if (rowM && rowM.previousElementSibling) {
      rowM.previousElementSibling.textContent = pack ? 'Метров в пачке' : 'Метров в рулоне';
    }
    if (rowCost && rowCost.previousElementSibling) {
      rowCost.previousElementSibling.textContent = pack ? 'Стоимость пачки' : 'Стоимость рулона';
    }

    mass = roll;

    sel.addEventListener('change', function(){
      if (sel.value === 'own') {
        ownRow.hidden = false;
        own.value = own.value || String(roll);
        mass = Math.max(1, Number(own.value) || roll);
        own.focus();
      } else {
        ownRow.hidden = true;
        mass = Number(sel.value) || roll;
      }
      paint();
    });

    own.addEventListener('input', function(){
      mass = Math.max(1, Number(own.value) || 0);
      paint();
    });

    current = p;
    paint();

    /* ── В корзину ──
       Кладём тот вес, который сейчас стоит в калькуляторе:
       человек уже посчитал партию, незачем заставлять его
       вводить её ещё раз в корзине. */
    var toCart = document.getElementById('to-cart');
    var added = document.getElementById('added');
    toCart.addEventListener('click', function(){
      S.cart.add(p.id, mass, color);
      added.hidden = false;
      added.textContent = 'Добавлено: ' + S.num0(mass) + ' кг. Всего в корзине — ' +
        S.cart.count() + ' ' + S.cart.plural(S.cart.count(), 'позиция', 'позиции', 'позиций') + '.';
      toCart.querySelector('span').textContent = 'Добавить ещё';
    });

    /* ── Плавающая кнопка «Купить» ──
       Пока настоящая кнопка «В корзину» не на экране, показываем
       таблетку внизу справа: на телефоне до калькулятора нужно
       прокрутить всю карточку. Как только он виден — прячем,
       чтобы не перекрывать сам блок покупки. */
    var jump = document.getElementById('jump');
    if (jump && toCart) {
      /* Считаем геометрию сами, без IntersectionObserver и без rAF:
         и то и другое привязано к циклу отрисовки и в части окружений
         доставляется через раз. Одно чтение координат на событие
         прокрутки стоит дёшево, зато работает всегда. */
      function syncJump(){
        var r = toCart.getBoundingClientRect();
        /* запас снизу: кнопка, показавшаяся у самого края, ещё не
           «на экране» — до неё нужно доскроллить */
        jump.hidden = r.top < window.innerHeight - 40 && r.bottom > 0;
      }

      addEventListener('scroll', syncJump, { passive:true });
      addEventListener('resize', syncJump);
      syncJump();

      jump.addEventListener('click', function(e){
        e.preventDefault();
        toCart.scrollIntoView({ behavior: S.reduced ? 'auto' : 'smooth', block: 'center' });
      });
    }

    root.hidden = false;
  }

  /* Пересчёт всех цифр калькулятора. Вызывается при смене
     массы и при обновлении курса — формулы в core.js одни
     и те же для каталога и карточки. */
  function paint(){
    if (!current) return;
    var rate = S.rate();
    var ok = S.rateOk();
    /* Градация выбирается по введённой массе: перевалило за порог —
       калькулятор сам переходит на оптовую цену (ТЗ 2.4). */
    var c = S.calc(current, rate, mass);

    var usdNote = S.usd(c.usdKg) + ' за кг · курс ' + S.rub(rate);
    if (c.hasBulk) {
      usdNote += c.isBulk
        ? ' · цена от ' + c.bulkFrom + ' кг'
        : ' · от ' + c.bulkFrom + ' кг дешевле';
    }

    document.getElementById('c-kg').innerHTML   = (ok ? '' : '≈ ') + S.rub(c.kg) + ' <small>/кг</small>';
    document.getElementById('c-usd').textContent = usdNote;
    document.getElementById('c-m').textContent   = c.m ? S.rub(c.m) + ' / м' : '—';
    document.getElementById('c-rollm').textContent = c.rollM ? '≈ ' + S.num0(c.rollM) + ' м' : '—';
    document.getElementById('c-roll').textContent  = '≈ ' + S.rub0(c.rollRub);
    /* «примерно» рядом с массой — ТЗ 2.7 */
    document.getElementById('c-mass').textContent  = 'Основной товар: примерно ' + S.num0(mass) + ' кг';
    document.getElementById('c-total').textContent = S.rub0(c.kg * mass);

    /* Позиции без пм/кг считаются только по килограммам: строки
       про метры и рулон скрываем целиком, а не ставим прочерк (ТЗ 2.8). */
    ['c-m','c-rollm','c-roll'].forEach(function(idName){
      var el = document.getElementById(idName);
      var row = el && el.closest ? el.closest('.calc__row') : null;
      if (row) row.hidden = !current.mPerKg;
    });
  }

  document.addEventListener('saltex:fx', paint);

  /* ── Загрузка ── */
  C.load().then(function(data){
    var p = data.products.filter(function(o){ return o.id === id; })[0];
    if (!p) {
      if (fail) {
        fail.hidden = false;
        document.getElementById('fail-text').textContent = id
          ? 'Позиция «' + id + '» не найдена. Возможно, её убрали из наличия.'
          : 'Не указан артикул позиции.';
      }
      return;
    }
    var draft = document.getElementById('draft');
    if (draft) draft.hidden = data.source !== 'mock';
    render(data, p);
  }).catch(function(err){
    if (fail) {
      fail.hidden = false;
      document.getElementById('fail-text').textContent =
        'Не удалось загрузить данные каталога. Обновите страницу или напишите менеджеру.';
    }
    console.error('[карточка] ошибка загрузки:', err);
  });
})();
