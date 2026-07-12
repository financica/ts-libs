# The Intervat API

_Version 09/07/2025_

## Versioning

We will continuously improve our documentation and APIs. Consequently, you can find here what has changed from previous versions of the documentation and/or API.

| Date       | Change                                                                            |
| ---------- | --------------------------------------------------------------------------------- |
| 25/02/2025 | Initial version for PRD                                                           |
| 09/07/2025 | Additional info on the testing before production & removal of faulty redirect URL |

## What is the Intervat API?

Intervat API is a REST API that allows in the initial version the submission of VAT returns. Later on the other types of returns may be added to the system.

The Intervat API follows the Belgian government institutions standards for REST API described in:

https://www.belgif.be/specification/rest/api-guide/#bad-request

## Security

The authentication/authorization flow is explained in another knowledgebase article (how to access SPF Finances API's) as we use this for several different API's. We only complete this section with the specific URL needed to call the Intervat API.

### Calling the Intervat API -- Specific URL

You can then call any method that is available in the appropriate environment via the appropriate URL.

- **ACC**: `https://wsapi-a.minfin.be/Intervat/api/OAU/v1/declaration/vat/xxxxxxxxxxxx`
- **PROD**: `https://wsapi.minfin.fgov.be/Intervat/api/OAU/v1/declaration/vat/xxxxxxxxxxxx`

**Important:**

You need to specify the OAuth token for every Intervat API REST call.

Intervat API follows the OpenAPI 3.0.0 standards, and so delivers the technical specifications of Intervat API via an openapi.yaml file, which defines available REST operations that can be performed. For more information on how those specifications files work, you can go here: https://spec.openapis.org/oas/v3.0.0

The OpenAPI specification of Intervat can be found via the following URLs:

1. **ACC**: `https://wsapi-a.minfin.be/Intervat/api/OAU/v1/doc/intervat-external-api.yaml`
2. **PROD**: `https://wsapi.fgov.minfin.be/Intervat/api/OAU/v1/doc/intervat-external-api.yaml`

For the previous solutions and more info about the access of our API's, please read the specific article about the security of our _API's: How to access SPF Fin API's_ before.

In case a doubt arises on which specification is up-to-date, the most up-to-date is always the one exposed using the swagger-ui or the exposed yaml file.

**Important:**

As mentioned as well in the security document (see 2.3), you need to specify the OAuth token for every Intervat API REST call. Therefore each call to the API's must have the following HTTP Header:

- name: `Authorization`
- value: `Bearer oAuthToken`

The header must be used when calling the API for the token, see example:

```
--header 'Accept: application/octet-stream'
Exemple: curl --location 'https://wsapi-a.minfin.be/Intervat/api/OAU/v1//doc/intervat-external-api.yaml' \
--header 'Accept: application/octet-stream' \
--header 'Authorization: Bearer XXXXXXXXXXXXXXXXXX' \
--header 'Cookie:
BIGipServermuPtPohsqNN4uHtOicXsTQ=ImFKN2l7GEfcWYBEhEjguo3vJkKfQRl3vQoEkhtkJryg84Nr2NnK
58jdX1y6CAkRZvtNcGeAyL8ngjA==;
NSC_GfseIBN_bdd_TTM443=ffffffff091d6be445525d5f4f58455e445a4a4216cb;
TS015ebd60=01cb7f968c026d67f79983d5b3baae8a7a7be88ce73c291c3f70b6ee5e4b925f3b1d4768
59ba213f42c55ce44240a5e7707386b3B8'
```

> See step 2.2. of the security document for more details

### Testing Tool

For the security-part a testing-tool has been provided that you can use with minimal effort to obtain a valid Access Token in our Acceptance environment. This tool may **not** be used in production.

All the details are again in the security-documentation.

## What can I do with this API?

Via this version of the Intervat API it's possible to submit VAT returns via XML. Later on the other types of returns may be added.

### Submission

The submission will be limited to the following rules:

- The file that can be used must be in the XML format linked to the XSD description, see links:
    - Technische documentatie - Intervat | FOD Financien (belgium.be)
    - Documentation technique - Intervat | SPF Finances (belgium.be)
- Submissions are only possible via correct electronical VAT mandates
- The part "Representative" is no longer an obligation, Intervat will determine if the link mandate-holder <-> mandate issuer is ok.
- The submission will be one at the time and logically only by file (XML or renamed zip file)
- In those files (renamed zip file) it's also possible to add annexes
- The submission proof (PDF and XML) will be returned as a UUID which can be downloaded via the MyMinFin API or via the normal Intervat dashboard or via MyMinfin/Enterprise
- The submissions will also be visible in the normal Intervat environment and all the actions that are possible in the normal Intervat environment will also be possible for returns entered via the API environment.

### Confirmation of Receipt

When the VAT return is submitted via API, a success message will be returned.

However, it is **not possible** to retrieve the receipt in document form via the Intervat API.

To retrieve this document via API, your company must also integrate the MMF API. If your company did not demand registration for this integration, please refill the registration-form via MMF so that your company can also integrate.

Due to performance reasons, the MMF API works with a cache system so that documents can only be retrieved the following day. If your end customer needs real-time receipts, they will need to retrieve them directly from Intervat or MyMinFin.

In a future version of our APIs, we will look at whether and how we can make this system more efficient.

## Problems

### A. Reporting an error while testing

In the event of an error occurring on our side, a tracking uuid will be in the response.
For example: `ca357af0-5ae2-3cca-9983-851e809e9c19`

Every error, problem or issue can be reported via our helpdesk by using the specific support-ticket: _"Problem or incident with the intervat-API"_

Please enter as much information as possible so that we can analyze the problem thoroughly.

### B. Error handling in function of the deposition of the VAT return

#### Errors returned by Intervat to the user

The eventual errors will be returned by Intervat to the connecting software using the standards described in: [REST Guidelines](https://www.belgif.be/specification/rest/api-guide/#bad-request)

Example:

```json
{
	"businessrules": [
		{
			"vatNumber": "0806153934",
			"sequenceNumber": 1,
			"type": "ERROR",
			"errorIdentifier": "E_TVA_DECLARANT_REGIME_NOT_ALLOWED",
			"descriptions": {
				"fr": "Le régime d'imposition à la TVA de l'assujetti ne lui permet pas de déposer une déclaration périodique à la TVA. Veuillez prendre contact avec le bureau de contrôle.",
				"de": "Die MwSt.-Regelung erlaubt es dem Steuerpflichtigen nicht, eine vierteljährliche periodische MwSt.-Erklärung zu hinterlegen. Berichtigen Sie bitte den Zeitraum oder setzen Sie sich mit dem MwSt.-Amt in Verbindung.",
				"nl": "Het belastingregime van de belastingplichtige laat hem niet toe een driemaandelijkse periodieke btw-aangifte in te dienen. Gelieve uw btw-controlekantoor te contacteren.",
				"en": "The taxpayer's tax regime does not allow him to submit a quarterly periodic VAT return. Please contact your VAT inspection office."
			}
		}
	],
	"type": "about:blank",
	"title": "Business validation error detected",
	"status": 400,
	"detail": "One or multiple business rules occurs",
	"instance": "error:uuid:EC57A32618844DC49AEF90329E5085BD"
}
```

#### Errors in function of business rules validations (probability errors)

Those must be explained in the XML itself in order to get a successful VAT Return deposition.

Without the extra tags, that VAT Return will be rejected.

Example: the entire list of errors are mentioned in the annexe 1

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ns2:VATConsignment VATDeclarationsNbr="1" xmlns="http://www.minfin.fgov.be/InputCommon"
xmlns:ns2="http://www.minfin.fgov.be/VATConsignment">
  <ns2:VATDeclaration SequenceNumber="1">
    <ns2:Declarant>
      <VATNumber>0000000097</VATNumber>
      <Name>testname</Name>
      <Street>teststreet</Street>
      <PostCode>9999</PostCode>
      <City>Testcity</City>
      <CountryCode>BE</CountryCode>
      <EmailAddress>Test.test@test.be</EmailAddress>
    </ns2:Declarant>
    <ns2:Period>
      <ns2:Month>3</ns2:Month>
      <ns2:Year>2024</ns2:Year>
    </ns2:Period>
    <ns2:Data>
      <ns2:Amount GridNumber="86">1000.00</ns2:Amount>
      <ns2:Amount GridNumber="55">500.00</ns2:Amount>
      <ns2:Amount GridNumber="71">500.00</ns2:Amount>
    </ns2:Data>
    <ns2:ClientListingNihil>NO</ns2:ClientListingNihil>
    <ns2:Ask Restitution="YES"/>
    <ns2:Comment>Commentaire test</ns2:Comment>
    <ns2:Justification Code="W_TVA_GRID_55_INCORRECT_VALUE_2">
      <Comment>commentaire justification</Comment>
    </ns2:Justification>
  </ns2:VATDeclaration>
</ns2:VATConsignment>
```

### 6. Other

In case of a problem not covered in this document, and you suspect it is coming from our side, please also use the "problem/incident with Intervat API"-form.

In case of feedback, remarks or questions concerning this documentation, please use as well the "problem/incident with Intervat API"-form.

## 7. Tests before entering production mode

There must be proof of the testing which have passed ALL the steps in the API system via the test system.

Type of tests:

- Registration
- Login
- Enter a simple VAT Return until status "Success"
- Enter Corrective VAT Returns until status "Success"
- Enter VAT Returns with probability errors until status "Success"

To get a permission to go to the production environment **all** the previous test must be successful. You have to initiate the validation-test by filling in the form: _"Validation-test to use INT-API in PRD"_

**Important:**

> To perform those tests you need VAT numbers which weren't used before in our testing-environment otherwise you will receive blocking errors due to the period in which the VAT Return can be entered (New VAT Chain).

You can request those VAT numbers by using the form _"Problem/Incident with the Intervat API"_.

Each testing entity will receive 1 VAT number with a quarterly obligation and 1 with a monthly obligation.

Dates:

1. Quarterly obligation: 25 the of the month following the former quarter.
2. Monthly obligation: 20 the of the month following the former month.

If the tests are OK Intervat will inform the other SPF services to open the API in Production for your company and update your credentials on our side. The Intervat team will send you a message as well with the confirmation of the validation. Then there is still one step left to take:

You have to send us one last time an update of your OIDC-client by filling out the form: _"REQUEST TO UPDATE INFORMATION OIDC CLIENT"_.

For more info about the steps in the registration, integration or validation-process, you can always check the dedicated knowledge article: **"Overview of the registration, integration and validation-process of the SPFFIN-API('s)"** that is to be found as well in our API-portal.

## Annexe 1: Validation key + calculation

| #   | Key                               | Rule                                                                                                                                            |
| --- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | W_TVA_GRID_54O_INCORRECT_VALUE    | Si G54 contient une valeur et que (((G1\*0,06)+(G2\*0,12)+(G3\*0,21))-54) > 62 => Erreur                                                        |
| 2   | W_TVA_GRID_5657_INCORRECT_VALUE   | Si G87 différent de 0 et G56 =0 et G57=0 et G87 > 250 => Erreur                                                                                 |
| 3   | W_TVA_GRID_5657_INCORRECT_VALUE_2 | Si (G56+G57)+((G85+G87)\*0,21) > 150 => Erreur                                                                                                  |
| 4   | W_TVA_GRID_55_INCORRECT_VALUE     | Si G55 = null et (G86 est différent de null ou G88 est différent null) et (G86+G88)>250 => Erreur                                               |
| 5   | W_TVA_GRID_59_INCORRECT_VALUE     | Si G59- ((G81+G82+G83+G84+G85)\*0,21) >= 100000 OU (G59- ((G81+G82+G83+G84+G85)\*0,21)>= 300000 et (G59- ((G81+G82+G83+G84+G85)\*0,21)>= 300000 |
| 6   | W_TVA_GRID_64_INCORRECT_VALUE     | Si G64 contient une donnée et (G64- ((G81+G82+G83+G84+G85)\*0,21) /(G81+G82+G83+G84+G85)) >= 0,05 => Erreur                                     |
| 7   | W_TVA_GRID_55_INCORRECT_VALUE_3   | Si (((G86+G88)\*0,06)-G55) > 150 => Erreur                                                                                                      |
| 8   | W_TVA_GRID_5657_INCORRECT_VALUE_3 | Si ((G87\*0,06)-(G56+G57))>150 => Erreur                                                                                                        |
| 9   | W_TVA_GRID_55_INCORRECT_VALUE_2   | Si (G55-((G84+G86+G88)\*0,21)) >150 => Erreur                                                                                                   |

### Annexe 1: Text shown in the normal Intervat after validation

| #   | Frans                                                                                                                                                                                                                                              | Nederlands                                                                                                                                                                                                                                                              | Duits                                                                                                                                                                                                                                                                                                      | Engels                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Le montant total de TVA que indiqué dans la grille 54 ne correspond pas aux taux de TVA appliqués respectivement sur les bases imposables indiquées dans les grilles 01, 02 et 03. Merci de corriger ou de justifier votre calcul (déclarant (0)). | Het totale verschuldigde BTW-bedrag dat in rooster 54 is vermeld, komt niet overeen met de BTW-tarieven die respectievelijk worden toegepast op de in de roosters 01, 02 en 03 vermelde bedragen. Gelieve uw berekening te corrigeren of te verantwoorden (BTW nr (0)). | Der in Raster 54 eingetragene Gesamtbetrag der zu zahlenden Mehrwertsteuer entspricht nicht den Mehrwertsteuersätzen, die jeweils auf die in den Rastern 01, 02 und 03 eingetragenen Beträge angewendet werden. Bitte korrigieren oder begründen Sie Ihre Berechnung (MwSt.-Nr. (0)).                      | The total amount of VAT due entered in grid 54 does not correspond to the VAT rates applied respectively to the amounts entered in grids 01, 02 and 03. Please correct or justify your calculation (VAT No (0)). |
| 2   | Vous avez introduit un montant dans la grille 87 (montant hors TVA). Vous devez en principe indiquer la TVA due dans les grilles 56 et/ou 57. Merci de justifier ou de compléter au moins une de ces deux grilles (déclarant (0)).                 | U heeft een bedrag ingevuld in rooster 87 (bedrag exclusief BTW). In principe moet u de verschuldigde BTW in de roosters 56 en/of 57 invoeren. Gelieve minstens één van deze twee roosters te verantwoorden of in te vullen (BTW nr (0)).                               | Sie haben einen Betrag im Raster 87 eingegeben (Betrag ohne Mehrwertsteuer). Im Prinzip müssen Sie die geschuldete Mehrwertsteuer im Raster 56 und/oder 57 eintragen. Bitte begründen Sie mindestens eines dieser beiden Raster oder füllen Sie mindestens eines dieser beiden Raster aus (MwSt.-Nr. (0)). | You have entered an amount in grid 87 (amount excluding VAT). In principle, you must enter the VAT due in grid 56 and/or 57. Please justify or fill in at least one of these two grids (VAT No (0)).             |
| 3   | Le montant des grilles 56 et/ou 57 (TVA due à l'Etat) est supérieur à 21% de la somme introduite dans les grilles B5 et/ou B7 (montant hors TVA). Merci de corriger ou de justifier votre calcul (déclarant (0)).                                  | Het bedrag in de roosters 56 en/of 57 (aan de Staat verschuldigde BTW) is groter dan 21% van het bedrag dat in de roosters B5 en/of B7 (bedrag exclusief BTW) is opgenomen. Gelieve uw berekening te corrigeren of te verantwoorden (BTW nr (0)).                       | Der Betrag in den Rastern 56 und/oder 57 (dem Staat geschuldete Mehrwertsteuer) ist größer als 21% des in den Rastern B5 und/oder B7 enthaltenen Betrags (Betrag ohne Mehrwertsteuer). Bitte korrigieren oder begründen Sie Ihre Berechnung (MwSt.-Nr. (0)).                                               | The amount in grids 56 and/or 57 (VAT due to the State) is greater than 21% of the amount included in grids B5 and/or B7 (amount excluding VAT). Please correct or justify your calculation (VAT No (0)).        |
| 4   | Vous avez introduit un montant dans la grille 86 et/ou 88 (montant hors TVA). Vous devez en principe indiquer la TVA due dans la grille 55. Merci de justifier ou de compléter cette grille (déclarant (0)).                                       | U heeft een bedrag ingevuld in rooster 86 en/of 88 (bedrag exclusief BTW). In principe moet u de verschuldigde BTW in rooster 55 invoeren. Gelieve dit rooster te verantwoorden of aan te vullen (BTW nr (0)).                                                          | Sie haben einen Betrag im Raster 86 und/oder 88 eingegeben (Betrag ohne Mehrwertsteuer). Im Prinzip müssen Sie die fällige Mehrwertsteuer im Raster 55 eintragen. Bitte begründen oder ergänzen Sie dieses Raster (MwSt.-Nr. (0)).                                                                         | You have entered an amount in grid 86 and/or 88 (amount excluding VAT). In principle, you must enter the VAT due in grid 55. Please justify or complete this grid (VAT No (0)).                                  |
| 5   | Le montant de la grille 59 (TVA déductible) est supérieur à 21% du montant total des grilles 81 à 85 (base imposable). Merci de corriger ou de justifier votre calcul (déclarant (0)).                                                             | Het bedrag van rooster 59 (Aftrek) is hoger dan 21% van het totale bedrag van de roosters 81 tot 85 (basis van heffing). Gelieve uw berekening te corrigeren of te verantwoorden (BTW nr (0)).                                                                          | Die Menge des Rasters 59 (Abzug) ist höher als 21% der Gesamtmenge der Raster 81 bis 85 (Steuerbasis). Bitte korrigieren oder begründen Sie Ihre Berechnung (MwSt.-Nr. (0)).                                                                                                                               | The amount of grid 59 (Deduction) is higher than 21% of the total amount of grids 81 to 85 (tax base). Please correct or justify your calculation (VAT No (0)).                                                  |
| 6   | Le montant de la grille 54 (TVA déclarée) est supérieur à 21% du montant total des grilles 01 à 03 (base imposable). Merci de corriger ou de justifier votre calcul (déclarant (0)).                                                               | Het bedrag in rooster 54 (aftrekbare BTW) is hoger dan 21% van het totale bedrag in de roosters 84, 86 en 88 (basis van heffing). Gelieve uw berekening te corrigeren of te verantwoorden (BTW nr (0)).                                                                 | Der Betrag in Raster 54 (abzugsfähige MwSt.) ist höher als 21% des Gesamtbetrags in Raster 84, 86 en 88 (Steuerbasis). Bitte korrigieren oder begründen Sie Ihre Berechnung (MwSt.-Nr. (0)).                                                                                                               | The amount in grid 54 (deductible VAT) is higher than 21% of the total amount of grids 84, 86 and 88 (tax base). Please correct or justify your calculation (VAT No (0)).                                        |
| 7   | Le montant de la grille 55 (TVA due) est inférieur à 6% du montant total des grilles 86 et 88 (base imposable). Merci de corriger ou de justifier votre calcul (déclarant (0)).                                                                    | Het bedrag des Raster 55 (verschuldigde BTW) is kleiner dan 6% van het totale bedrag van de roosters 86 en 88 (basis van heffing). Gelieve uw berekening te corrigeren of te verantwoorden (BTW nr (0)).                                                                | Der Betrag des Raster 55 (geschuldete Mehrwertsteuer) ist kleiner als 6% des Gesamtbetrags der Raster 86 und 88 (Steuerbasis). Bitte korrigieren oder begründen Sie Ihre Berechnung (MwSt.-Nr. (0)).                                                                                                       | The amount of grid 55 (VAT due) is lower than 6% of the total amount of grids 86 and 88 (tax base). Please correct or justify your calculation (VAT No (0)).                                                     |
| 8   | Le montant des grilles 56 et/ou 57 (TVA due à l'Etat) est inférieur à 6% de la somme introduite dans la grille 87 (montant hors TVA). Merci de corriger ou de justifier votre calcul (déclarant (0)).                                              | Het bedrag in de roosters 56 en/of 57 (aan de Staat geschuldigde BTW) is kleiner dan 6% des in rooster 87 enthaltenen Betrags (Betrag ohne Mehrwertsteuer). Gelieve uw berekening te corrigeren of te verantwoorden (BTW nr (0)).                                       | Der Betrag in den Rastern 56 und/oder 57 (dem Staat geschuldete Mehrwertsteuer) ist kleiner als 6% des in Raster 87 enthaltenen Betrags (Betrag ohne Mehrwertsteuer). Bitte korrigieren oder begründen Sie Ihre Berechnung (MwSt.-Nr. (0)).                                                                | The amount in grids 56 and/or 57 (VAT due to the State) is lower than 6% of the amount included in grid 87 (amount excluding VAT). Please correct or justify your calculation (VAT No (0)).                      |
| 9   | Le montant de la grille 55 (TVA due) est supérieur à 21% du montant total des grilles 84, 86 et 88 (base imposable). Merci de corriger ou de justifier votre calcul (déclarant (0)).                                                               | Het bedrag van rooster 55 (verschuldigde BTW) is hoger dan 21% van het totale bedrag van de roosters 84, 86 en 88 (basis). Gelieve uw berekening te corrigeren of te verantwoorden (BTW nr (0)).                                                                        | Der Betrag des Raster 55 (geschuldete Mehrwertsteuer) ist höher als 21% des Gesamtbetrags der Raster 84, 86 und 88 (Steuerbasis). Bitte korrigieren oder begründen Sie Ihre Berechnung (MwSt.-Nr. (0)).                                                                                                    | The amount of grid 55 (VAT due) is higher than 21% of the total amount of grids 84, 86 and 88 (tax base). Please correct or justify your calculation (VAT No (0)).                                               |

---
