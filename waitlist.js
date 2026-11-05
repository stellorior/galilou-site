/* Galilou — formulaire « Prévenez-moi à la sortie sur Android » (GAL-280).
   Envoie l'adresse à la fonction android-waitlist de Galilou, sans cookie,
   sans stockage local, sans script tiers. Sans JavaScript, le formulaire
   HTML fonctionne seul (envoi classique, réponse texte). */
(function () {
  'use strict';

  if (!window.fetch) return;

  var EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
  var TEXTES = {
    envoi: 'Envoi en cours…',
    merci: 'Merci ! Nous vous écrirons dès que Galilou sera disponible sur Android.',
    adresse: "Il manque quelque chose dans l'adresse e-mail. Vérifiez-la, par exemple : prenom@exemple.fr",
    oups: "Oups, l'inscription n'a pas fonctionné. Réessayez dans un instant."
  };

  var formulaires = document.querySelectorAll('form[data-attente-android]');
  Array.prototype.forEach.call(formulaires, function (form) {
    var champ = form.querySelector('input[name="email"]');
    var nouveautes = form.querySelector('input[name="wants_news"]');
    var piege = form.querySelector('input[name="website"]');
    var bouton = form.querySelector('button[type="submit"]');
    var message = form.querySelector('.attente-message');

    function afficher(texte, genre) {
      message.textContent = texte;
      message.className = 'attente-message' + (genre ? ' attente-' + genre : '');
    }

    form.setAttribute('novalidate', '');

    form.addEventListener('submit', function (evenement) {
      evenement.preventDefault();

      var adresse = champ.value.trim();
      if (!EMAIL.test(adresse)) {
        champ.setAttribute('aria-invalid', 'true');
        afficher(TEXTES.adresse, 'erreur');
        champ.focus();
        return;
      }
      champ.removeAttribute('aria-invalid');

      bouton.disabled = true;
      afficher(TEXTES.envoi, '');

      fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({
          email: adresse,
          wants_news: nouveautes.checked,
          website: piege.value
        })
      })
        .then(function (reponse) {
          if (reponse.ok) {
            form.reset();
            afficher(TEXTES.merci, 'ok');
          } else if (reponse.status === 400) {
            champ.setAttribute('aria-invalid', 'true');
            afficher(TEXTES.adresse, 'erreur');
          } else {
            afficher(TEXTES.oups, 'erreur');
          }
        })
        .catch(function () {
          afficher(TEXTES.oups, 'erreur');
        })
        .then(function () {
          bouton.disabled = false;
        });
    });
  });
})();
