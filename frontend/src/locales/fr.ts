export default {
  common: {
    user: 'Utilisateur',
    userInitial: 'U'
  },
  navigation: {
    home: 'Accueil',
    channels: 'Mes Chaînes',
    summaries: 'Mes Résumés',
    signOut: 'Déconnexion',
    toSummaries: 'Mes Résumés',
    toHome: 'Accueil'
  },
  channels: {
    title: 'Chaînes Suivies',
    addChannel: {
      title: 'Ajouter une Chaîne',
      description: 'Commencez en entrant l\'URL de la chaîne YouTube que vous souhaitez résumer',
      placeholder: 'Ajoutez l\'URL de la chaîne YouTube...',
      button: 'Ajouter',
      example: 'Exemple: https://youtube.com/c/channelname'
    },
    features: {
      ai: {
        title: 'Résumés IA',
        description: 'Nous créons automatiquement des résumés intelligents pour chaque nouvelle vidéo'
      },
      email: {
        title: 'Notifications par E-mail',
        description: 'Recevez les résumés par e-mail, lisez-les quand vous voulez'
      }
    },
    channelList: {
      addedOn: 'Ajouté le'
    }
  },
  summaries: {
    title: 'Mes Résumés Vidéo',
    filters: {
      all: 'Tous',
      today: 'Aujourd\'hui',
      week: 'Cette Semaine',
      month: 'Ce Mois'
    },
    actions: {
      listen: 'Écouter',
      markAsRead: 'Lu',
      watchOnYoutube: 'Regarder sur YouTube'
    },
    feedback: {
      title: 'Évaluer le Résumé',
      rating: {
        notRated: 'Pas encore évalué',
        rated: '{rating}/5 étoiles'
      },
      comment: {
        label: 'Votre Commentaire',
        placeholder: 'Que pensez-vous de ce résumé ?'
      },
      submit: 'Envoyer l\'Évaluation'
    }
  },
  footer: {
    about: {
      title: 'À Propos',
      description: 'VideoAI est un outil de transcription et de résumé de vidéos YouTube alimenté par l\'IA.'
    },
    quickLinks: {
      title: 'Liens Rapides',
      home: 'Accueil',
      about: 'À Propos'
    },
    contact: {
      title: 'Contact',
      description: 'Des questions ? Contactez-nous à support@videoai.com'
    }
  }
} 