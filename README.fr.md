<div align="center">

<img src="assets/banner.svg" alt="TADForce" width="100%">

### Le scribe de l'architecte pour les orgs Salesforce.

**Une commande. Une org. Un document d'architecture technique fondé sur des preuves, reproductible, relu dans le navigateur.**

[English](README.md) · [**Démo en ligne**](https://azamiji.github.io/TADForce/)

</div>

<img src="assets/divider.svg" width="100%" alt="">

## 👋 Voici Tad

<img src="assets/logo-mark.svg" width="96" align="right" alt="Tad">

Tad est un compas dont les bras forment une équerre. Il lit votre org comme le ferait un architecte Salesforce senior : chaque classe, Flow, objet, Permission Set Group, Named Credential et OmniScript. Il écrit ensuite le document que votre client lit vraiment.

Tad n'a qu'une règle : **pas de preuve, pas de phrase.** Si les métadonnées ne le prouvent pas, Tad vous pose la question ou écrit « à confirmer ». Il ne devine jamais le nom d'un système, ne documente jamais une fonction décommissionnée et ne tape jamais un chiffre à la main.

## ⚡ Démarrage

```bash
npx tadforce init
```

Puis, dans votre agent IA (Claude Code, Codex, Cursor, Copilot…), à la racine de votre projet Salesforce DX :

```text
/tadforce
```

Le skill enchaîne toutes les étapes :

1. Il vérifie les prérequis et vous demande de vous connecter à l'org.
2. Il récupère toutes les métadonnées avec un manifest en `*`, puis extrait les faits.
3. Il vous pose les quelques questions dont seul un humain connaît la réponse.
4. Il rédige les 15 chapitres, produit le **HTML, le PDF et le DOCX**, valide, et vous remet les fichiers.

Votre client commente ensuite directement dans le HTML. `/tadforce-review` intègre chaque commentaire dans les sources et dans la base de connaissances.

**Prérequis** : Node.js 20+, Salesforce CLI (`sf`), Chrome ou Edge, un agent IA. `npx tadforce doctor` vérifie tout et indique quoi faire.

| Chemin | Commandes |
|---|---|
| Plugin Claude Code | `/plugin marketplace add azamiji/TADForce` puis `/plugin install tadforce@tadforce` |
| Tout agent (Agent Skills) | `npx tadforce init` installe les skills dans `.claude/`, `.agents/`, `.cursor/`, `.codex/`… |
| Déterministe / CI | `npx tadforce prepare --org prod`, puis `npx tadforce build --pdf --docx`, puis `npx tadforce validate` |

## 📦 Ce que vous obtenez

- **Document d'architecture technique**, destiné au client :
  - en HTML : navigable, modifiable en place, avec commentaire d'un passage ou capture d'une zone, enregistrement dans le même fichier et export PDF ou Word ;
  - en PDF A4 et en DOCX.
- **Axes d'amélioration**, document interne à l'intégrateur : signaux mesurés par pilier Well-Architected, registre `AX-nn` et feuille de route. Ils restent hors du document client.
- **`facts.json`** : l'inventaire déterministe de l'org, identique octet pour octet d'une exécution à l'autre.

## 🏛️ Un modèle universel

Toutes les orgs reçoivent le même squelette : synthèse, objet et périmètre, contexte, architecture générale, fonctionnel, données, applicatif, interface, intégrations, sécurité, reporting, exploitation, exigences non fonctionnelles et Well-Architected, décisions, perspectives, puis les annexes générées.

Une section ne s'active que si le produit est détecté, et chaque produit a sa fiche de rédaction :

- **Clouds** : Sales, Service, Field Service, Experience, Marketing, Commerce, CPQ et Revenue ;
- **Industries** : Financial Services, Insurance, Health, Life Sciences, Manufacturing, Automotive, Consumer Goods, Communications, Public Sector, Education, Nonprofit, Loyalty, Net Zero ;
- **Plateforme** : OmniStudio, Data Cloud, Agentforce, CRM Analytics, Platform Events, Shield, MuleSoft, Heroku et Slack.

## 🔒 Lecture seule par construction

- **Liste blanche des commandes `sf`** : pas de deploy, pas de suppression, pas d'exécution d'Apex.
- **Garde-fou SOQL** : seuls les objets de configuration de l'org et les agrégats sont lus, jamais les données métier.
- **`force-app` jamais modifié** : la récupération se fait dans `tadforce/.snapshot`.
- **Aucun secret dans le texte** : la validation bloque les secrets et les identifiants d'org.

## 🎯 Reproductible

- **Les chiffres sont des placeholders**, par exemple `{{n:apex.classes}}`.
- **Les tableaux, les ERD, la hiérarchie des rôles et les annexes sont générés.**
- **84 fiches de section** cadrent la rédaction de n'importe quel agent.
- **`npx tadforce validate`** bloque tout ce qui ne doit pas être livré.

## 👤 Auteur

**Jihad AZAMI HASSANI** — Salesforce Technical Architect, leader du Salesforce Architect Community Group de Casablanca.

## ⚖️ Licence

[Apache-2.0](LICENSE). Salesforce et les noms de ses produits sont des marques de Salesforce, Inc. TADForce est un projet communautaire indépendant, ni affilié à Salesforce ni approuvé par elle. L'organisation de l'exemple (Northwind Bank, Acme Integrators) est fictive.
