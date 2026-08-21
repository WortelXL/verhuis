# Verhuisplanner

Klusplanning voor een verhuizing: inlogpagina + een tijdlijn (Gantt-stijl) waarin je
klussen kunt slepen om ze te verschuiven of te verlengen/verkorten, met
gebruikersbeheer (rollen), een aanpasbare legenda en weeknummers bij elke
maandag. Draait als Docker-container; data wordt opgeslagen in lokale
bestanden in `data/` zodat alles bewaard blijft als de container herstart.

## Rollen

- **Beheerder**: mag alles — gebruikers aanmaken/verwijderen/rol wijzigen,
  wachtwoorden resetten, categorieën/legenda beheren, én de planning invullen.
- **Gebruiker**: mag klussen toevoegen, verslepen, aanpassen, afvinken en
  verwijderen in de tijdlijn, maar heeft geen toegang tot de beheerpagina.

De eerste beheerder wordt automatisch aangemaakt bij de eerste start, met de
gebruikersnaam/wachtwoord uit `APP_USERNAME` / `APP_PASSWORD`. Daarna beheer
je alle accounts via **Beheer** in de app zelf (rechtsboven, alleen zichtbaar
voor beheerders).

## Starten met Docker Compose (aanbevolen)

1. Open `docker-compose.yml` en pas `APP_USERNAME`, `APP_PASSWORD` en
   `SESSION_SECRET` aan naar iets van jezelf — dit wordt de eerste beheerder.
2. Start de container:

   ```bash
   docker compose up -d --build
   ```

3. Ga naar **http://localhost:3000** en log in.

Je taken worden bewaard in de map `./data` naast dit project, ook als je de
container opnieuw opbouwt.

## Starten met alleen Docker (zonder compose)

```bash
docker build -t verhuisplanner .
docker run -d \
  --name verhuisplanner \
  -p 3000:3000 \
  -e APP_USERNAME=admin \
  -e APP_PASSWORD=verander-dit-wachtwoord \
  -e SESSION_SECRET=iets-random-en-geheim \
  -v $(pwd)/data:/app/data \
  verhuisplanner
```

## Lokaal draaien zonder Docker (optioneel, voor testen)

```bash
npm install
APP_USERNAME=admin APP_PASSWORD=test1234 npm start
```

## Gebruik

- **Nieuwe klus toevoegen**: linkerpaneel — titel, categorie, start- en
  einddatum, eventueel notities.
- **Verschuiven**: sleep een balk in de tijdlijn horizontaal om de klus naar
  een andere datum te verplaatsen (begin en einde schuiven mee).
- **Verlengen/verkorten**: sleep de linker- of rechterrand van een balk.
- **Klaar markeren**: vink het vakje voor de titel aan.
- **Verwijderen**: klik op het kruisje naast een titel.
- **Weeknummer**: staat als klein label boven elke maandag in de tijdlijn.

Alle wijzigingen worden direct opgeslagen (via de API) — een broodkruimel-
melding rechtsonder bevestigt dit.

## Beheerpagina (alleen voor beheerders)

Via **Beheer** rechtsboven in de tijdlijn:

- **Gebruikers**: nieuwe gebruikers aanmaken (met rol), rol van een bestaande
  gebruiker wijzigen, wachtwoord resetten, gebruiker verwijderen. Er moet
  altijd minstens 1 beheerder overblijven; je kunt je eigen account niet
  verwijderen.
- **Legenda / categorieën**: categorieën toevoegen, naam en kleur aanpassen,
  of verwijderen. Deze categorieën verschijnen automatisch in het
  "nieuwe klus"-formulier, de legenda en als kleur op de tijdlijnbalken.

## Techniek

- Backend: Node.js + Express, sessie-cookies voor login. Geen database nodig
  — gebruikers, categorieën en taken staan als JSON-bestanden in `data/`.
  Wachtwoorden worden gehasht opgeslagen (scrypt + salt), nooit in platte tekst.
- Frontend: puur HTML/CSS/JavaScript, geen build-stap nodig.
- Bedoeld voor persoonlijk/gezinsgebruik met een klein aantal accounts.

## Wachtwoord van de eerste beheerder wijzigen

Dit kan het makkelijkst via de beheerpagina zelf (wachtwoord resetten). Wil je
het wachtwoord instellen vóórdat je voor het eerst opstart, pas dan
`APP_USERNAME` en `APP_PASSWORD` aan in `docker-compose.yml` — dit geldt
alleen bij de allereerste start (wanneer er nog geen `data/users.json`
bestaat).
