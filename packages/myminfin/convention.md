# Convention d'utilisation API SPF Finances

## Table des matières

- [Article 1 : Définitions](#article-1--définitions)
- [Article 2 : Parties concernées](#article-2--parties-concernées)
- [Article 3 : Objet de la Convention](#article-3--objet-de-la-convention)
- [Article 4 : Description et fonctionnement de l'API](#article-4--description-et-fonctionnement-de-lapi)
- [Article 5 : Droits, responsabilités et obligations dans le chef du SPF Finances](#article-5--droits-responsabilités-et-obligations-dans-le-chef-du-spf-finances)
- [Article 6 : Droits, responsabilités et obligations dans le chef de l'Utilisateur agréé](#article-6--droits-responsabilités-et-obligations-dans-le-chef-de-lutilisateur-agréé)
- [Article 7 : Protection des données](#article-7--protection-des-données)
- [Article 8 : Droits de propriété intellectuelle](#article-8--droits-de-propriété-intellectuelle)
- [Article 9 : Mesures de sécurité](#article-9--mesures-de-sécurité)
- [Article 10 : Frais](#article-10--frais)
- [Article 11 : Durée et prise d'effet](#article-11--durée-et-prise-deffet)
- [Article 12 : Problèmes, litiges et sanctions](#article-12--problèmes-litiges-et-sanctions)
- [Article 13 : Responsabilité](#article-13--responsabilité)
- [Article 14 : Dispositions générales](#article-14--dispositions-générales)
- [Article 15 : Droit applicable et juridiction compétente](#article-15--droit-applicable-et-juridiction-compétente)
- [Article 16 : Signature](#article-16--signature)

---

## Article 1 : Définitions

Dans la présente Convention, les termes écrits avec une majuscule initiale sont définis comme suit. Pour faciliter la lecture du document, le masculin générique est utilisé comme forme neutre.

| Terme                     | Description                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API                       | signifie « application programming interface » (interface de programmation d'application) et fait l'objet de cette Convention. L'API a été développée par le SPF Finances.                                                                                                                                                                                                                                                                      |
| Jeton API                 | désigne la clé unique avec laquelle l'Utilisateur agréé et l'Utilisateur final peuvent s'identifier et avec laquelle l'API peut être utilisée.                                                                                                                                                                                                                                                                                                  |
| Authentification          | consiste à établir l'identité de quelqu'un.                                                                                                                                                                                                                                                                                                                                                                                                     |
| Autorisation              | renvoie au contrôle effectué par le SPF Finances pour vérifier si un Utilisateur final authentifié peut effectivement avoir accès à la Plateforme du SPF.                                                                                                                                                                                                                                                                                       |
| RGPD                      | Le règlement (UE) 2016/679 du Parlement européen et du Conseil du 27 avril 2016 relatif à la protection des personnes physiques à l'égard du traitement des données à caractère personnel et à la libre circulation de ces données, et abrogeant la directive 95/46/CE (règlement général sur la protection des données).                                                                                                                       |
| Incident de cybersécurité | désigne un événement, quelle qu'en soit la cause, lors duquel la sécurité de l'API, des systèmes d'information, des réseaux ou des données de l'une des Parties est menacée et par lequel la confidentialité, l'intégrité ou la disponibilité de l'API ou des systèmes est compromise, avec ou sans Fuite de données.                                                                                                                           |
| Fuite de données          | désigne une violation de données à caractère personnel au sens de l'article 4, 12), du RGPD. Plus précisément : une violation de la sécurité entraînant, de manière accidentelle ou illicite la destruction, la perte, l'altération, la divulgation non autorisée de données transmises, conservées ou traitées d'une autre manière, ou l'accès non autorisé à de telles données.                                                               |
| Utilisateur agréé         | désigne toute Entreprise de logiciels qui a signé la présente Convention et qui est ensuite enregistrée comme Utilisateur agréé auprès du SPF Finances. L'Utilisateur agréé prendra les mesures nécessaires pour utiliser l'API.                                                                                                                                                                                                                |
| Utilisateur final         | désigne toute entreprise ou personne physique qui utilise directement le Progiciel de l'Utilisateur agréé et est par conséquent le client de l'Utilisateur agréé. Cet Utilisateur final pourra utiliser les fonctionnalités issues de l'API soit pour consulter ses propres documents sur une Plateforme du SPF soit pour consulter les documents de son mandant sur une Plateforme du SPF à laquelle il peut avoir accès en vertu d'un mandat. |
| Plateforme du SPF         | désigne une plateforme électronique sécurisée gérée par le SPF Finances à laquelle l'Utilisateur final a accès, comme MyMinFin.                                                                                                                                                                                                                                                                                                                 |
| Journalisation            | désigne l'enregistrement chronologique, le suivi et la visualisation de données numériques à propos des événements d'un processus. Grâce à ces données de connexion, un événement numérique particulier peut être reconstitué et analysé.                                                                                                                                                                                                       |
| Convention                | renvoie à la présente Convention d'utilisation API.                                                                                                                                                                                                                                                                                                                                                                                             |
| Entreprise de logiciels   | désigne toute entreprise qui développe un Progiciel et le propose aux Utilisateurs finaux afin de regrouper, structurer, visualiser, simplifier et/ou automatiser leurs tâches administratives et/ou numériques.                                                                                                                                                                                                                                |
| Progiciel                 | désigne un programme spécifique qui vise à regrouper, structurer, visualiser, simplifier et/ou automatiser ses tâches administratives et/ou numériques de l'Utilisateur final. Il peut notamment s'agir d'un programme de comptabilité qui effectue automatiquement des calculs pour l'Utilisateur final ou visualise ses recettes et dépenses.                                                                                                 |

## Article 2 : Parties concernées

La présente Convention est conclue entre :

- Le Service public fédéral Finances
    - adresse : Boulevard du Roi Albert II 33 1030 Bruxelles
    - numéro d'entreprise : 0308.357.159
    - représenté par : Filip Van de Velde, Président du Comité de direction

Dénommé dans cette convention **SPF Finances**

ET

- Entreprise de logiciels : Ingram Technologies
    - adresse : Rue du Poinçon 51A 1000 Bruxelles
    - Numéro BCE : 0766.280.697
    - représentant légal : Jerome Leclanche

Dénommée dans cette convention **Utilisateur agréé**

## Article 3 : Objet de la Convention

Le SPF Finances a développé des API qui permettent à une partie du logiciel d'une Plateforme du SPF de communiquer avec le Progiciel de l'Utilisateur agréé. Les documents disponibles sur une Plateforme du SPF peuvent ainsi être visualisés et téléchargés par l'Utilisateur final directement dans le Progiciel qu'il utilise pour effectuer ses tâches administratives ou, inversement, les documents peuvent être téléchargés par l'Utilisateur final depuis le Progiciel vers une Plateforme du SPF.

La présente Convention définit les conditions, les droits et les obligations pour garantir une utilisation correcte des API du SPF Fin.

## Article 4 : Description et fonctionnement de l'API

### 4.1. Description

Une API peut permettre de visualiser et de télécharger des documents disponibles sur une Plateforme du SPF directement dans le Progiciel de l'Utilisateur agréé, dans l'environnement de l'Utilisateur final, ou de télécharger des documents du Progiciel vers une Plateforme du SPF.

L'API assure donc un lien entre le Progiciel de l'Utilisateur agréé et une Plateforme du SPF. Grâce à ce lien, l'Utilisateur final peut alors consulter et/ou enregistrer des documents d'une Plateforme du SPF directement dans le Progiciel, ou les télécharger vers une Plateforme du SPF.

### 4.2. Fonctionnement (technique)

Le fonctionnement technique et les fonctionnalités précises d'une API en particulier sont décrits dans la documentation prévue à cet effet. Cette documentation est également jointe à la Convention à signer et mise à la disposition de l'Utilisateur agréé après l'enregistrement en tant qu'Utilisateur agréé via le canal prévu à cet effet. L'Utilisateur agréé peut également retrouver plus d'informations à propos des API existantes, de la procédure d'enregistrement et des fonctionnalités correspondantes sur la page du site web du SPF Finances.

Par la présente Convention, l'Utilisateur agréé confirme satisfaire aux exigences qui sont indiquées dans la documentation. L'Utilisateur agréé s'informera également périodiquement des modifications apportées à la documentation, conformément aux règles de l'art et aux pratiques professionnelles habituelles. Le SPF Finances fera le nécessaire pour communiquer activement sur les modifications apportées à la documentation via le canal prévu à cet effet.

## Article 5 : Droits, responsabilités et obligations dans le chef du SPF Finances

Dans le cadre de cette Convention, le SPF Finances est chargé :

- la disponibilité, capacité et performance des API ;
- du support technique, et de la gestion des problèmes et des plaintes de l'Utilisateur agréé.

### 5.1. Utilisation des API et accès à une Plateforme du SPF

Lorsque l'Utilisateur agréé, sur les instructions de l'Utilisateur final, demande via une API l'accès aux documents d'une Plateforme du SPF pour lesquels l'Utilisateur final dispose d'une autorisation (soit personnellement, soit via son mandant), alors le SPF Finances examine au mieux si cet accès peut être accordé conformément au système d'authentification et d'autorisation intégré tel que décrit dans la documentation.

Lors de chaque demande d'accès, il sera vérifié :

1. qu'il existe une Convention signée entre le SPF Finances et l'Utilisateur agréé ;
2. qu'il existe une relation validée entre l'Utilisateur agréé et l'Utilisateur final ;
3. que l'Utilisateur final identifié est autorisé à avoir accès aux données.

Si l'une des conditions ci-dessus n'est pas remplie, aucun accès à l'API et à la Plateforme du SPF ne sera accordé.

### 5.2. Mises à jour

Le SPF Finances se réserve le droit de déployer de nouvelles versions des API et d'imposer une migration des API existantes vers une nouvelle version. Il est question d'une nouvelle version lorsque celle-ci contient des différences essentielles et/ou substantielles qui ne sont pas compatibles avec la version actuelle.

Une nouvelle version est toujours d'abord mise à la disposition dans l'environnement de test. L'Utilisateur agréé a la possibilité de tester la nouvelle version pendant une période de minimum six mois au cours de laquelle il pourra transmettre au SPF Finances ses remarques sur le fonctionnement de la nouvelle version. Le SPF Finances décidera, à sa discrétion et au mieux de ses possibilités, si la nouvelle version a été suffisamment testée pendant la période de test et si elle est prête à être déployée.

Le SPF Finances déploie des efforts raisonnables pour s'assurer que les mises à jour des API sont rétrocompatibles avec la version précédente.

Lorsque la rétrocompatibilité ne peut être maintenue, et pour garantir la disponibilité des données pour les Utilisateurs finaux via les API, le SPF Finances s'engage à maintenir la version précédente des API en production pendant une période maximale de six mois à compter de la date de mise en production de la nouvelle version.

Le SPF Finances n'est plus tenu de mettre à disposition ou de maintenir les anciennes versions après cette période.

Le SPF Finances se réserve le droit de bloquer ou de suspendre temporairement l'utilisation de toute API pour des raisons de maintenance ou pour toute autre raison jugée nécessaire pour assurer le bon fonctionnement de cette API. L'Utilisateur agréé en sera informé dans les délais via le canal prévu à cet effet. L'indisponibilité ne donne à l'Utilisateur agréé aucun droit à une quelconque compensation.

### 5.3. Support, gestion des problèmes et des plaintes

Pour mieux gérer les questions, problèmes ou incidents liés à l'utilisation des API, le SPF Finances mettra à la disposition de l'Utilisateur agréé une FAQ ainsi que de la documentation technique et de support nécessaire.

En outre, le SPF Finances mettra également un système de ticket à la disposition de l'Utilisateur agréé afin qu'il puisse contacter le SPF Finances en cas de problème.

Les deux outils d'assistance sont disponibles via la Plateforme du SPF prévue à cet effet. L'Utilisateur agréé recevra les données nécessaires pour accéder à et utiliser cette Plateforme du SPF.

L'Utilisateur agréé confirme par la signature de cette Convention qu'il est de sa propre responsabilité de fournir à l'Utilisateur final un support suffisamment équipé et solide (support de première ligne) pour les services achetés dans le cadre de sa propre offre de services. En aucun cas, le SPF Finances ne fournit un support direct aux Utilisateurs finaux de l'Utilisateur agréé dans le cadre de l'utilisation de ces API.

## Article 6 : Droits, responsabilités et obligations dans le chef de l'Utilisateur agréé

Après signature de la présente Convention, l'Entreprise de logiciels est enregistrée en tant qu'Utilisateur agréé auprès du SPF Finances.

L'Utilisateur agréé prend les mesures techniques et organisationnelles nécessaires pour veiller à ce que les API soient utilisées et mises en oeuvre conformément à la présente Convention et à la documentation disponible. L'ensemble des composants et de la documentation mis à disposition ne peuvent être utilisés que dans le but d'intégrer et d'utiliser les API. Ces composants ne peuvent pas être utilisés à d'autres fins ou pour d'autres systèmes.

Dans le chef de l'Utilisateur agréé, les droits, responsabilités et obligations suivants sont applicables :

### 6.1. Droit au support

L'Utilisateur agréé a accès à la documentation technique nécessaire à la mise en oeuvre/l'intégration des API dans son Progiciel.

Tel qu'indiqué à l'article 5.3. « Support, gestion des problèmes et des plaintes », l'Utilisateur agréé a accès dans le cadre de cette Convention à la Plateforme du SPF pour la résolution de problèmes qui surviennent au cours de l'utilisation de l'API. Cet accès est octroyé par l'intermédiaire d'un compte personnel au portail. L'utilisation de ce compte personnel ne peut être cédé à des tiers.

L'objectif est de limiter le nombre de comptes personnels qui sont créés pour un Utilisateur agréé au strict minimum. Il incombe donc à l'Utilisateur agréé d'informer le SPF Finances lorsqu'un tel compte local n'est plus utilisé et doit être supprimé. Ceci peut être géré via la Plateforme du SPF.

### 6.2. Accès à une Plateforme du SPF -- Utilisation d'un Jeton API

L'Utilisateur agréé formule chaque demande d'accès, et ce conformément au système d'authentification et d'autorisation mis en place et à la documentation technique fournie.

L'Utilisateur agréé reçoit à cet effet un Jeton API. Le Jeton API ne peut être utilisé que pour le compte de et selon les instructions de l'Utilisateur final. L'Utilisateur agréé ne dispose lui-même d'aucun accès à la Plateforme du SPF et ne peut pas y être agréé. L'utilisation d'une API à des fins de consultation ou de transmission de données disponibles dans une Plateforme du SPF est réservée à l'Utilisateur final.

L'Utilisateur agréé est tenu de manipuler le Jeton API avec soin, de le garder secret, de ne pas le mettre à la disposition de tiers et de le conserver en lieu sûr.

Le Jeton API ne peut être utilisé que pour l'utilisation de l'API et ne peut être introduit dans d'autres sites web ou systèmes.

### 6.3. Obligation d'information et support à l'Utilisateur final

L'Utilisateur agréé est responsable de la manière par laquelle les données récupérées ou consultées à partir d'une Plateforme SPF via les API sont affichées à l'Utilisateur final.

L'Utilisateur agréé informe l'Utilisateur final de l'existence et du contenu de la présente Convention et indique à l'Utilisateur final qu'il ne jouit d'aucun support direct de la part du SPF Finances en ce qui concerne l'utilisation des API.

Il relève donc de la responsabilité de l'Utilisateur agréé de fournir à l'Utilisateur un support final (support de première ligne) suffisamment équipé et solide pour les services achetés dans le cadre de sa propre offre de services.

L'Utilisateur agréé est, **si nécessaire**, tenu de mettre à jour ses propres conditions d'utilisation afin de garantir une utilisation sûre des API, et ce conformément à la présente Convention. Il peut notamment, et de manière non exhaustive, mentionner dans ces conditions les éléments suivants :

- Lorsque l'Utilisateur final découvre dans les données reçues des erreurs ou des oublis, il le signale via le formulaire de contact général du SPF Finances.
- Dès que l'Utilisateur final est au courant que son accès à une Plateforme du SPF est susceptible d'avoir été compromis (par exemple, en raison de la perte d'un ordinateur portable), il doit en informer l'Utilisateur agréé dès que possible afin qu'il puisse bloquer l'accès à l'API et ainsi éviter un Incident de cybersécurité ou une Fuite de données.
- Le SPF Finances a le droit, à tout moment, de demander à l'Utilisateur final de lui remettre tout ou partie des supports d'information sur lesquels il a stocké des données du SPF Finances.

### 6.4. Marketing

L'Utilisateur agréé ne peut pas utiliser le logo du SPF Finances dans son logiciel, ses communications, son marketing et/ou sur son site web. Le SPF Finances n'est pas non plus autorisé à utiliser le logo de l'Utilisateur agréé.

L'Utilisateur agréé ne peut pas utiliser le statut d'« Utilisateur agréé » à des fins de marketing. Les dérivés de ce terme tels que « partenaire certifié du SPF Finances » ou « approuvé par le SPF Finances » ne peuvent pas non plus être utilisés. L'Utilisateur agréé peut uniquement utiliser la mention « compatible avec [nom de la plateforme, par exemple MyMinFin] du SPF Finances » afin de respecter la neutralité du SPF Finances.

## Article 7 : Protection des données

Grâce à l'Utilisation d'une API, les données à caractère personnel conservées sur une Plateforme du SPF sont mises à la disposition d'un Utilisateur final par le SPF Finances. Ni ce traitement, ni aucune autre utilisation d'une API dans le cadre de la présente Convention, n'établit entre les Parties une relation de sous-traitant et de responsable du traitement ou de responsables conjoints du traitement.

Chaque Partie reste indépendamment responsable du respect de ses propres obligations en vertu du RGPD et des autres lois et réglementations nationales applicables en matière de protection des données. Chaque Partie s'engage également à respecter ces obligations.

## Article 8 : Droits de propriété intellectuelle

Le SPF Finances est et reste le propriétaire des API et des droits de propriété intellectuelle liés aux API et à la documentation correspondante. L'Utilisateur agréé s'engage à respecter les droits de propriété intellectuelle du SPF Finances.

L'Utilisateur agréé dispose d'un droit temporaire non exclusif et non transférable, sans possibilité d'accorder des sous-licences, d'utilisation des API exclusivement aux fins décrites dans la présente Convention.

## Article 9 : Mesures de sécurité

### 9.1. Dans le chef du SPF Finances

Le SPF Finances prend les mesures techniques et organisationnelles nécessaires pour assurer au mieux la sécurité des API.

### 9.2. Dans le chef de l'Utilisateur agréé

L'Utilisateur agréé prend les mesures techniques et organisationnelles nécessaires pour garantir la sécurité de la connexion entre l'Utilisateur final et la Plateforme du SPF. L'Utilisateur agréé est responsable de la sécurité de son propre Progiciel et des données qui peuvent y être consultées ou auxquelles il peut avoir accès, ainsi que du Jeton API.

### 9.3. Piste d'audit

L'Utilisateur agréé confirme que la mise en place d'une piste d'audit est nécessaire dans le cadre de l'utilisation de l'API et garantit également qu'une piste d'audit sera installée. Une piste d'audit assure que les transactions effectuées via l'API puissent être reconstituées. Cela signifie entre autres qu'une Journalisation concluante doit être mise en oeuvre.

L'Utilisateur agréé confirme que le principe des **« cercles de confiance »** sera appliqué. Cela signifie que **chaque partenaire de la chaîne est tenu à titre individuel de prendre les mesures nécessaires pour conserver des données sélectionnées dans sa piste d'audit**, de manière à ce qu'il soit possible, par la combinaison des données tenues à jour par les différents partenaires de la chaîne, de parvenir à une reconstruction complète de l'ensemble du flux de données d'une transaction spécifique.

Les différents partenaires de la chaîne sont :

- le SPF Finances ;
- l'Utilisateur agréé ;
- l'Utilisateur final.

Le SPF Finances enregistre toutes les opérations qui sont effectuées par le biais des API ainsi que par le biais des composants qui permettent le fonctionnement des API. L'on entend ici par composants entre autres : _au niveau du composant ESB (Enterprise Service Bus), le composant d'authentification et d'identification, le composant de gestion du mandat et le composant de gestion des documents._

Ces informations sont également traitées de manière anonyme à des fins statistiques et pour l'amélioration de ce service. Les données ne sont en aucun cas liées aux données personnelles collectées au cours des procédures.

L'Utilisateur agréé doit enregistrer toutes les données et transactions nécessaires pour établir une reconstitution complète de quelle personne s'est adressée à quel service et de quand quelle information ou quel document a été consulté. Cette demande de reconstruction peut faire suite à une enquête, à l'initiative d'une autorité ou d'un organisme de contrôle concerné ou à une plainte. Cela nécessite au minimum l'enregistrement et la conservation des données et transactions suivantes : _Les authentifications, tentatives d'authentification (date, heure, numéro d'identification et un message ID afin de pouvoir établir un lien avec l'adresse IP, le navigateur et un système d'exploitation) ainsi que les transactions avec l'API._

L'Utilisateur agréé doit conserver ces données pendant une période de minimum 12 mois. Dans le cadre d'un audit, l'Utilisateur agréé doit être en mesure de fournir ces données dans les 72 heures.

Dans le cadre de la mise en service des API, le SPF Finances peut exiger que cette piste d'audit soit testée pour garantir une utilisation sécurisée des API avant la mise en production de la connexion.

L'Utilisateur agréé est lui-même responsable des procédures et de l'infrastructure lui permettant d'y parvenir de manière sécurisée et dans le respect des dispositions relatives à la protection des données, comme par exemple, mais sans s'y limiter, une Convention de traitement avec l'Utilisateur final.

### 9.4. Droit d'audit

Le SPF Finances a le droit, à ses propres frais, une fois par année civile, ou à chaque fois qu'il existe une suspicion raisonnable que l'API soit utilisée en violation de la présente Convention, de procéder à un audit de l'Utilisateur agréé afin de vérifier que l'API est utilisée conformément aux dispositions de la présente Convention et de la documentation correspondante.

Le SPF Finances informera par écrit l'Utilisateur agréé de l'audit prévu au moins 15 jours à l'avance.

L'Utilisateur agréé donnera au SPF Finances un accès raisonnable à ses systèmes, à ses installations et à la documentation nécessaire à la réalisation de l'audit. Les deux Parties agissent de bonne foi pour assurer le bon déroulement de l'audit.

Le SPF Finances fera de son mieux pour mener l'audit de manière à perturber le moins possible les activités professionnelles normales de l'Utilisateur agréé. Le SPF Finances traitera toutes les informations obtenues dans le cadre de l'audit de manière confidentielle et ne les utilisera que pour évaluer la mise en oeuvre de la présente Convention.

Le SPF Finances informera par écrit l'Utilisateur agréé des résultats de l'audit. Si l'audit fait apparaître des violations contractuelles, l'Utilisateur agréé proposera des mesures correctives pour rétablir le respect de la Convention dans les 30 jours suivant la réception et en informera le SPF Finances par écrit. Le SPF Finances se réserve le droit de résilier la présente Convention et d'en informer l'Utilisateur agréé.

Sauf accord écrit contraire, chaque Partie supporte ses propres frais liés à la réalisation de l'audit. Toutefois, si l'audit révèle des violations importantes de la présente Convention, l'Utilisateur agréé remboursera les frais raisonnables engendrés par l'audit.

## Article 10 : Frais

L'utilisation de l'API du SPF Finances est gratuite.

Les frais liés à la mise en oeuvre de l'API sont totalement à charge de l'Utilisateur agréé.

## Article 11 : Durée et prise d'effet

La présente Convention prend effet à la date de sa signature par les Parties. La présente Convention peut être résiliée par toute Partie à tout moment par écrit moyennant un délai de préavis de trois mois.

## Article 12 : Problèmes, litiges et sanctions

### 12.1. Fuite de données

Les éventuels incidents pouvant donner lieu à une Fuite de données sont :

- l'accès à des données à caractère personnel par une personne non agréée
- une action intentionnelle ou non intentionnelle affectant la sécurité des données à caractère personnel
- l'envoi de données personnelles à un destinataire erroné
- le vol ou la perte d'équipements informatiques contenant des données à caractère personnel
- la modification des données à caractère personnel sans consentement

Conformément à l'article 33 du RGPD, en cas de violation données à caractère personnel, le responsable du traitement en notifie la violation en question à l'autorité de contrôle compétente, dans les meilleurs délais et, si possible, 72 heures au plus tard après en avoir pris connaissance, à moins que la violation en question ne soit pas susceptible d'engendrer un risque pour les droits et libertés des personnes physiques. De plus amples informations et la procédure de signalement d'une Fuite de données se trouvent sur le site de l'[Autorité de protection des données](https://www.autoriteprotectiondonnees.be/professionnel/actions/fuites-de-donnees-personnelles).

### 12.2. Incident de cybersécurité

Si l'Utilisateur agréé est victime d'un Incident de cybersécurité, il doit suivre la procédure décrite dans la brochure « [Cyber Incident Roadmap](https://www.vbo-feb.be/fr/publications/cyber-incident-roadmap/) » se trouvant sur le site web de la Fédération des entreprises de Belgique (FEB).

### 12.3. Suspension et interruption

Le SPF Finances se réserve le droit de suspendre unilatéralement l'accès à l'API de manière temporaire et avec effet immédiat en cas de problèmes avec l'Utilisateur agréé qui ne permettraient pas de garantir une utilisation correcte et sûre de l'API.

Il s'agit notamment de suspicion d'abus de la part de l'Utilisateur agréé (par exemple, suspicion de manipulations non agréées du Jeton API), du non-respect des conditions d'utilisation (par exemple, de l'absence de Journalisation suffisamment concluante), ainsi que de Fuites de données et/ou d'Incidents de cybersécurité.

La suspension de l'API dure jusqu'à ce qu'une garantie suffisante soit apportée quant à la possibilité d'utiliser à nouveau l'API de manière sécurisée.

### 12.4. Résiliation

Le SPF Finances se réserve le droit de mettre fin unilatéralement et définitivement à l'accès des API, sans notification écrite préalable, avec effet immédiat en cas de :

- suspension de l'accès à l'API conformément à l'article 12.3 pour une période de trois mois ;
- violation d'une ou plusieurs dispositions de la Convention ou en cas d'abus (tel que, entre autres, des manipulations avec les Jetons API) ;
- faillite de l'Utilisateur agréé.

En cas de résiliation de la présente Convention, l'Entreprise de logiciels perd son statut d'Utilisateur agréé et n'est plus autorisé à continuer à utiliser les API.

## Article 13 : Responsabilité

En cas de problèmes d'application ou d'infraction à la présente Convention, les Parties s'engagent à se consulter et à coopérer pour parvenir à un règlement à l'amiable dans les meilleurs délais.

L'Utilisateur agréé est responsable de tout dommage qui serait subi par le SPF Finances si l'(les) employé(s) de l'Utilisateur agréé ne respecte(nt) pas la présente Convention.

L'Utilisateur agréé est responsable de tout dommage qui serait causé au SPF Finances à la suite de l'exécution (incorrecte) ou au non-respect des obligations de la Convention de traitement entre l'Utilisateur agréé et l'Utilisateur final.

Le SPF Finances n'est responsable qu'en cas de fraude et de faute intentionnelle et/ou grave. La responsabilité pour toute autre faute, y compris la négligence grave, est exclue. L'Utilisateur agréé reconnaît que la mise à disposition de l'API n'est pas une obligation essentielle du SPF Finances et en informe l'Utilisateur final. En cas d'indisponibilité de l'API, l'Utilisateur final peut toujours consulter directement la Plateforme du SPF. Le SPF Finances n'est donc pas responsable de toute forme de dommages indirects tels que la perte de clientèle, la perte de goodwill, l'atteinte à la réputation, la perte de bénéfices, l'augmentation des coûts opérationnels, les coûts des services de remplacement, ou les réclamations des Utilisateurs finaux.

Le SPF Finances n'est pas responsable si l'accès à l'API ne peut être accordé pour des raisons indépendantes de la volonté du SPF Finances (défaillance technique, problèmes de connexion Internet, force majeure, mise à jour urgente de sécurité, non-respect des conditions d'authentification et d'autorisation, etc.) ou en raison d'une décision de suspension de l'accès à l'API conformément à l'article 12.3.

## Article 14 : Dispositions générales

Le SPF Finances a le droit de modifier unilatéralement la présente Convention si l'une de ses dispositions s'avère invalide, nulle, inapplicable ou obsolète. Toute modification sera communiquée à l'Utilisateur agréé via le canal prévu à cet effet et entrera en vigueur quinze jours plus tard. Si la modification concerne une modification des droits, responsabilités et/ou obligations d'une des Parties concernées, l'Utilisateur autorisé devra alors approuver à nouveau le contenu de la Convention via la Plateforme du SPF. Si une disposition de la présente Convention est invalide, nulle ou inapplicable ou obsolète, la validité ou l'applicabilité de la Convention n'en sera pas pour autant compromise. Le SPF Finances fournira dans ce cas des efforts raisonnables pour remplacer la clause invalide ou nulle par une disposition valide dans un délai raisonnable qui se rapproche le plus possible de l'objectif de la disposition invalide ou nulle.

Les Parties concernées ne peuvent pas céder la présente Convention à un tiers.

Le fait que l'une des Parties n'applique pas une disposition de la présente Convention ne doit pas être considéré comme une renonciation à cette disposition ou à ses droits, et n'affecte pas la capacité d'appliquer ces dispositions ou ces droits à l'avenir.

## Article 15 : Droit applicable et juridiction compétente

Cette Convention est régie par le droit belge. Tout litige qui naît de la présente Convention ne peuvent être porté uniquement devant les tribunaux de Bruxelles.

## Article 16 : Signature

La signature de la présente Convention se fait via la Plateforme MyMinFin. Le représentant légal du candidat Utilisateur agréé recevra un message (via l'e-box) auquel est joint la présente Convention d'utilisation. Ce message permet au représentant légal d'indiquer qu'il a lu et approuvé la Convention d'utilisation en question.

Le représentant légal dispose d'un mois pour le faire. Si le candidat Utilisateur agréé ne répond pas dans les délais, la procédure d'enregistrement en cours sera interrompue.
