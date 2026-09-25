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
    /* Артикул с карточки убран (правка 25.09): в подзаголовке
       остаётся только вид полотна. У набивки его место занимает
       название выбранного рисунка. */
    sub.textContent = p.typeName;

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
      ['Упаковка',      p.form === 'пачка' ? 'пачками' : 'рулонами'],
      ['Метров в 1 кг', p.mPerKg ? S.num1(p.mPerKg) : null]
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

    /* У ткани свой набор оттенков (ТЗ каталог 8): списки лежат
       в colors.json ключом byFabric, ключ — артикул позиции.
       Списка нет — показываем всю карту, как раньше. */
    var byFabric = (window.SALTEKS_COLORS && window.SALTEKS_COLORS.byFabric) || {};
    var ownColors = byFabric[p.id];
    if (ownColors && ownColors.length) {
      palette = palette.filter(function(c){
        return ownColors.indexOf(String(c.p)) !== -1;
      });
    }
    var SHOWN = 16;      /* сколько оттенков видно до «показать ещё» */

    /* ── Набивка: образцы рисунка вместо цветов (ТЗ каталог 14) ──
       Нажатие меняет фотографию в карточке, а название рисунка
       работает артикулом — так просил заказчик. */
    if (p.prints && p.prints.length && box && sw) {
      box.classList.add('prod__colors--prints');
      var head = box.querySelector('.prod__h');
      if (head && head.firstChild) head.firstChild.nodeValue = 'Рисунок ';
      var cnt = document.getElementById('colors-count');
      if (cnt) cnt.textContent = p.prints.length;
      pickLabel.textContent = 'Рисунок не выбран';

      sw.innerHTML = p.prints.map(function(pr){
        return '<button class="prod__sw prod__sw--print" type="button"' +
               ' data-print="' + S.esc(pr.f) + '" data-name="' + S.esc(pr.n) + '"' +
               ' style="background-image:url(' + S.esc(pr.f) + ')"' +
               ' aria-pressed="false" title="' + S.esc(pr.n) + '">' +
               '<span class="vh">' + S.esc(pr.n) + '</span></button>';
      }).join('');

      sw.addEventListener('click', function(e){
        var b = e.target.closest('.prod__sw--print');
        if (!b) return;
        sw.querySelectorAll('.prod__sw--print').forEach(function(o){
          o.setAttribute('aria-pressed', String(o === b));
        });
        shot.innerHTML = texture() +
          '<img src="' + S.esc(b.dataset.print) + '" alt="' +
          S.esc(p.name + ' — ' + b.dataset.name) + '" decoding="async">';
        pickLabel.textContent = 'Выбран ' + b.dataset.name;
        pickLabel.classList.add('is-set');
        var subLine = document.getElementById('sub');
        if (subLine) subLine.innerHTML = S.esc(p.typeName) + ' · ' + S.esc(b.dataset.name);
      });

    /* У части позиций своих цветов нет — палитру там не показываем
       целиком, вместе с припиской про менеджера (ТЗ каталог 13). */
    } else if (box && sw && palette.length && p.colors !== false) {
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
            : 'Показать все ' + palette.length;
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

    /* ── Стрелки под фотографией (ТЗ каталог 5) ──
       Листают ряд на ширину видимой части. Если оттенки и так
       помещаются целиком — кнопки прячем, чтобы не мозолили глаз.
       В раскрытой палитре они не нужны, их убирает CSS. */
    var prevBtn = document.getElementById('colors-prev');
    var nextBtn = document.getElementById('colors-next');
    if (prevBtn && nextBtn && sw) {
      /* Замер ширины делаем не только сразу: на первом проходе
         раскладка ещё не готова, scrollWidth равен clientWidth,
         и кнопка «вперёд» гасла навсегда. Поэтому пересчитываем
         в следующем кадре и ещё раз, когда подгрузятся шрифты. */
      var syncArrows = function(){
        var max = sw.scrollWidth - sw.clientWidth - 1;
        prevBtn.disabled = sw.scrollLeft <= 0;
        nextBtn.disabled = max <= 0 || sw.scrollLeft >= max;
      };

      /* Листаем на ширину видимой части. Плавную прокрутку
         выполняют не все окружения, поэтому через треть секунды
         проверяем, сдвинулся ли ряд, и при необходимости ставим
         позицию сразу — кнопка обязана работать всегда. */
      function slide(dir){
        var from = sw.scrollLeft;
        var to = Math.max(0, Math.min(from + dir * sw.clientWidth,
                                      sw.scrollWidth - sw.clientWidth));
        if (sw.scrollBy) sw.scrollBy({ left: to - from, behavior: S.reduced ? 'auto' : 'smooth' });
        else sw.scrollLeft = to;

        setTimeout(function(){
          if (Math.abs(sw.scrollLeft - from) < 2 && Math.abs(to - from) > 2) {
            var prevBehavior = sw.style.scrollBehavior;
            sw.style.scrollBehavior = 'auto';
            sw.scrollLeft = to;
            sw.style.scrollBehavior = prevBehavior;
          }
          syncArrows();
        }, 320);
      }

      prevBtn.addEventListener('click', function(){ slide(-1); });
      nextBtn.addEventListener('click', function(){ slide(1); });
      sw.addEventListener('scroll', syncArrows);
      addEventListener('resize', syncArrows);
      if (moreBtn) moreBtn.addEventListener('click', function(){ setTimeout(syncArrows, 50); });

      syncArrows();
      requestAnimationFrame(syncArrows);
      setTimeout(syncArrows, 500);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncArrows);
    }

    /* ── Калькулятор: метры → килограммы ──
       Цен нет, поэтому вопрос у калькулятора один: сколько
       весит нужный метраж (ТЗ каталог 4). */
    var metres = document.getElementById('metres');
    var rollM = (p.roll_kg_avg && p.mPerKg) ? p.roll_kg_avg * p.mPerKg : 0;

    /* Часть полотна отгружается пачками, а не рулонами: у таких
       позиций в прайсе ширина записана как «60*2 (пачка)».
       Формулировка строки меняется вместе с формой отгрузки. */
    var pack = p.form === 'пачка';
    var rollLabel = document.getElementById('c-rollm-label');
    if (rollLabel) rollLabel.textContent = pack ? 'Метров в пачке' : 'Метров в рулоне';

    var mpkBox = document.getElementById('c-mpk');
    if (mpkBox) mpkBox.textContent = p.mPerKg ? S.num1(p.mPerKg) + ' м' : '—';

    var rollBox = document.getElementById('c-rollm');
    if (rollBox) rollBox.textContent = rollM ? '≈ ' + S.num0(rollM) + ' м' : '—';

    /* Без пм/кг перевод невозможен — убираем таблицу целиком,
       а не оставляем строки с прочерками. */
    var calcRows = document.getElementById('calc-rows');
    if (calcRows) calcRows.hidden = !p.mPerKg;

    current = p;
    paint();

    if (metres) metres.addEventListener('input', paint);

    /* ── В корзину ──
       Кладём тот вес, который сейчас стоит в калькуляторе:
       человек уже посчитал партию, незачем заставлять его
       вводить её ещё раз в корзине. */
    var toCart = document.getElementById('to-cart');
    var added = document.getElementById('added');
    toCart.addEventListener('click', function(){
      S.cart.add(p.id, mass, color);
      added.hidden = false;
      added.textContent = 'Добавлено: ' + S.num0(mass) + ' кг. Всего в запросе — ' +
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

  /* Перевод метража в вес. Цены и курс ЦБ из расчёта убраны
     (ТЗ каталог 3, 4, 16), поэтому формул из core.js здесь
     больше нет — одно деление на метры в килограмме. */
  function paint(){
    if (!current) return;

    var field = document.getElementById('metres');
    var m = Math.max(1, Number(field && field.value) || 0);
    mass = current.mPerKg ? m / current.mPerKg : 0;

    var kgBox = document.getElementById('c-kg');
    if (kgBox) kgBox.textContent = mass ? '≈ ' + S.num0(mass) + ' кг' : '—';

    var note = document.getElementById('c-mass');
    if (note) {
      note.textContent = mass
        ? S.num0(m) + ' м ≈ ' + S.num0(mass) + ' кг · отгрузка ' +
          (current.form === 'пачка' ? 'пачками' : 'рулонами')
        : 'Вес уточняйте у менеджера: метраж в килограмме у этой позиции не указан.';
    }
  }

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
