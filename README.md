# Les As de Cointe

Horloge de tournoi de poker pour les soirées entre amis. Une page web, aucune
installation, aucun compte : on ouvre le lien et on joue.

![Les As de Cointe](icon-192.png)

## Ce que ça fait

**La table** — les joueurs sont assis autour d'une table ovale. Le bouton (D),
la petite blind (SB) et la grosse blind (BB) tournent à chaque donne. Un appui
sur un joueur permet de l'éliminer, de lui donner le bouton, de noter une
recave ou de le renommer.

**Le chrono** — niveau en cours, blindes, antes, niveau suivant, barre de
progression. Cloche sonore au changement de niveau et alerte à une minute de la
fin. Montée automatique des blindes (ou manuelle, au choix).

**Les pauses** — celles prévues dans la structure et celles qu'on décide sur le
moment. Un grand écran de pause s'affiche avec son propre décompte.

**Les recaves** — ouvertes jusqu'à un niveau donné ou jusqu'à une heure précise.
L'app affiche en permanence si c'est encore possible et combien de temps il reste.

**Les comptes** — cave, recaves, prize pool et répartition des gains. C'est du
virtuel, pour le plaisir du tableau : l'application ne gère aucun paiement.

**« Qui gagne ? »** — en cas de doute sur une main : on saisit les cartes de
chacun et le tapis, et l'app tranche (« Couleur à l'As bat Brelan de 10 »), pots
partagés compris. Si le tapis n'est pas complet, elle affiche les chances de
gagner de chaque joueur.

**Le classement** — à la fin, le podium avec les gains, exportable en image à
envoyer dans le groupe.

**L'écran spectateur** — un code et un lien que les autres ouvrent sur leur
téléphone pour suivre en lecture seule : temps restant, blindes, joueurs encore
en lice, prize pool.

## Mettre en ligne (GitHub Pages)

1. Créer un dépôt sur GitHub, par exemple `as-de-cointe`.
2. Y déposer tous les fichiers de ce dossier (glisser-déposer fonctionne très
   bien sur github.com, bouton **Add file → Upload files**).
3. Onglet **Settings → Pages**, section *Build and deployment* : choisir
   **Deploy from a branch**, branche `main`, dossier `/ (root)`, puis **Save**.
4. Au bout d'une minute, le site est disponible sur
   `https://<compte>.github.io/as-de-cointe/`.

## Installer sur la tablette

Ouvrir le lien dans le navigateur, puis :

- **iPad / Safari** : bouton Partager → *Sur l'écran d'accueil*
- **Android / Chrome** : menu ⋮ → *Ajouter à l'écran d'accueil*

L'app s'ouvre alors en plein écran avec son icône, et fonctionne **sans réseau**
une fois chargée une première fois.

## Pendant la partie

| Geste | Effet |
|---|---|
| Appui sur un joueur | Éliminer, recave, donner le bouton, renommer |
| Bouton **Donne** | Fait tourner bouton / petite / grosse blind |
| Bouton **Pause** | Pause improvisée, avec son propre décompte |
| **+1 min** | Rallonge le niveau en cours |
| **Relancer** | Remet le niveau en cours à zéro |
| Barre d'espace | Démarrer / mettre en pause (au clavier) |
| Flèches ← → | Niveau précédent / suivant |

Tous les réglages (nom du tournoi, structure des blindes, joueurs, montants)
sont dans l'engrenage en haut à droite, et sont conservés sur l'appareil.

## Limite connue

L'écran spectateur fonctionne aujourd'hui entre plusieurs onglets ou fenêtres
**du même appareil**. Pour que les téléphones de tout le monde suivent en
direct, il reste une couche de synchronisation à brancher (une petite base en
ligne gratuite). Le tournoi lui-même n'en dépend jamais : la tablette
fonctionne seule, hors-ligne comprise.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Structure de la page |
| `styles.css` | Habillage |
| `app.js` | Chrono, table, joueurs, réglages, classement |
| `poker.js` | Évaluation des mains et calcul des chances |
| `sw.js` | Fonctionnement hors-ligne |
| `manifest.webmanifest` | Installation sur l'écran d'accueil |
| `icon*.png` | Icônes |

Aucune dépendance, aucun outil de construction : les fichiers sont servis tels quels.
