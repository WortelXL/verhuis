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

3. Ga naar **http://localhost** en log in.

Je taken worden bewaard in de map `./data` naast dit project, ook als je de
container opnieuw opbouwt.

> **Let op:** de app draait nu standaard op poort 80 (de gewone webpoort, dus
> geen `:3000` meer nodig in de URL). Draait er op je server al iets anders
> op poort 80 (bijv. een reverse proxy of een andere website), dan geeft
> `docker compose up` een foutmelding dat de poort al in gebruik is. Wijzig
> in dat geval het linkerdeel van de poort-mapping in `docker-compose.yml`,
> bijvoorbeeld `- "8080:80"` om de app bereikbaar te maken via poort 8080.

## Starten met alleen Docker (zonder compose)

```bash
docker build -t verhuisplanner .
docker run -d \
  --name verhuisplanner \
  -p 80:80 \
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
- **Toewijzen aan personen**: kies bij het aanmaken of bewerken van een klus
  één of meerdere personen. Ze verschijnen als gekleurde initialen op de
  balk; personen zelf beheer je via de beheerpagina.
- **Labels met icoon**: kies bij het aanmaken of bewerken van een klus één of
  meerdere labels (bijv. 📦 Fragiel, ⚡ Spoed). Labels zelf maak, wijzig en
  verwijder je via de beheerpagina.
- **Versie & changelog**: rechtsboven in de app staat het huidige
  versienummer. Klik erop voor een lijst met recente wijzigingen.
- **Maten**: aparte pagina (via de knop "Maten") om afmetingen vast te
  leggen, bijvoorbeeld een raam voor gordijnen. Vul een naam in, en daarna
  losse invoervelden voor lengte, breedte en hoogte (je hoeft niet alle drie
  in te vullen) met een eenheid naar keuze (cm, m, mm, inch).
- **To-do lijst**: aparte pagina (via de knop "To-do") om losse taken snel
  vast te leggen zonder meteen een datum te kiezen. Je kunt er ook labels
  met icoon aan hangen (klik op 🏷️ bij een to-do om ze te wijzigen). Klik op
  "Inplannen →" om een to-do als klus op de tijdlijn te zetten — dat opent de
  tijdlijn met titel én labels al ingevuld, jij kiest alleen nog de datum. De
  to-do wordt daarna automatisch afgevinkt en gekoppeld.
- **Hover & bewerken**: hover over een balk voor de details en notities in
  een tooltip; klik (zonder te slepen) op een balk om hem te bewerken.

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
- **Tijdlijnbereik**: stel in vanaf en tot welke datum de tijdlijn zichtbaar
  is (bijv. vanaf 1 september tot 15 oktober). Laat een van beide velden leeg
  voor automatisch. Klussen die buiten het ingestelde bereik vallen, blijven
  altijd zichtbaar — het bereik wordt dan tijdelijk verruimd zodat er nooit
  een balk "verdwijnt".
- **Personen**: voeg personen toe (naam + kleur) om aan klussen te koppelen,
  zodat je in één oogopslag ziet wie ermee bezig gaat. Dit zijn losse labels,
  geen inlogaccounts — ze verschijnen als gekleurde initialen op de
  tijdlijnbalk en in de tooltip.
- **Labels**: maak labels met een eigen icoontje (bijv. 📦 Fragiel, ⚡ Spoed),
  koppel er één of meerdere aan een klus. Het icoon verschijnt vóór de titel
  op de balk en de volledige lijst staat in de tooltip.

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
