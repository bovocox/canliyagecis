export default {
  common: {
    user: 'User',
    userInitial: 'U',
    signInWithGoogle: 'Sign in with Google',
    signOut: 'Sign Out',
    loading: 'Loading...',
    views: 'views'
  },
  navigation: {
    home: 'Home',
    channels: 'My Channels',
    summaries: 'My Summaries',
    signOut: 'Sign Out',
    toSummaries: 'My Summaries',
    toHome: 'Home'
  },
  home: {
    banner: {
      title: 'Summarize YouTube videos with AI',
      subtitle: 'One click, no tab switching, no prompting.\nGet expert-level summaries for videos of any topic and length.'
    },
    search: {
      placeholder: 'https://youtube.com/watch?v=...',
      button: 'Summarize'
    },
    error: {
      fetchFailed: 'Failed to fetch results'
    },
    tabs: {
      summary: 'Summary',
      summaryShort: 'Sum',
      list: 'List',
      listShort: 'List',
      transcript: 'Transcript',
      transcriptShort: 'CC',
      listen: 'Listen',
      listenShort: 'Play'
    },
    listen: {
      description: 'Click play to listen to the AI-generated summary of this video.',
      playButton: 'Play Summary'
    },
    features: {
      title: 'VideoAI: Your Key to Efficient YouTube Learning',
      keyIdeas: {
        title: 'Key Ideas Extraction',
        description: 'Get the main points and key takeaways from any YouTube video instantly.'
      },
      smartSummaries: {
        title: 'Smart Summaries',
        description: 'AI-powered summaries that capture the essence of the content accurately.'
      },
      transcripts: {
        title: 'Interactive Transcripts',
        description: 'Navigate through video content with searchable, time-stamped transcripts.'
      }
    },
    howItWorks: {
      title: 'How It Works',
      steps: {
        step1: {
          title: 'Add Video URL',
          description: 'Paste the YouTube video link'
        },
        step2: {
          title: 'AI Analysis',
          description: 'Our advanced AI system analyzes the video'
        },
        step3: {
          title: 'Smart Summary',
          description: 'Get instant detailed and clear summary'
        },
        step4: {
          title: 'Ready!',
          description: 'Read, listen or save your summary'
        }
      }
    },
    testimonials: {
      title: 'What Our Users Say',
      items: [
        {
          name: 'John Smith',
          role: 'Software Developer',
          image: '/testimonials/user1.jpg',
          comment: 'Perfect tool for summarizing technical videos. Instead of watching hours of content, I can quickly grasp the main points.',
          rating: 5
        },
        {
          name: 'Sarah Johnson',
          role: 'Education Consultant',
          image: '/testimonials/user2.jpg',
          comment: 'Summarizing video content for my students is now so easy. It has made the learning process much more efficient.',
          rating: 5
        },
        {
          name: 'Michael Brown',
          role: 'Content Creator',
          image: '/testimonials/user3.jpg',
          comment: 'Really helpful for competitor analysis and research. The AI summaries are impressively accurate.',
          rating: 4
        }
      ]
    },
    summary: {
      title: "Summary",
      detailButton: 'Detailed Summary',
      modal: {
        title: 'Detailed Video Summary',
        close: 'Close',
        share: 'Share',
        download: 'Download',
        sections: {
          overview: 'Overview',
          keyPoints: 'Key Points',
          details: 'Detailed Summary',
          quotes: 'Important Quotes'
        }
      }
    },
    transcript: {
      title: 'Transcript',
      empty: 'No transcript available for this video',
      loading: 'Translating... Will be ready soon! 🤓',
      detailButton: 'View Details',
      modal: {
        title: 'Video Transcript'
      }
    }
  },
  channels: {
    title: 'Following Channels',
    addChannel: {
      title: 'Add Channel',
      description: 'Start by entering the URL of the YouTube channel you want to summarize',
      placeholder: 'Add YouTube channel URL...',
      button: 'Add',
      example: 'Example: https://youtube.com/c/channelname'
    },
    features: {
      notifications: {
        title: 'Instant Notifications',
        description: 'Get notified instantly when new videos are uploaded to your followed channels.'
      },
      ai: {
        title: 'AI Summaries',
        description: 'We automatically create smart summaries for each new video'
      },
      email: {
        title: 'Email Notifications',
        description: 'Receive summaries by email, read them whenever you want'
      }
    },
    channelList: {
      addedOn: 'Added on'
    }
  },
  summaries: {
    title: 'My Video Summaries',
    filters: {
      all: 'All',
      today: 'Today',
      week: 'This Week',
      month: 'This Month'
    },
    actions: {
      listen: 'Listen',
      markAsRead: 'Mark as Read',
      watchOnYoutube: 'Watch on YouTube'
    },
    feedback: {
      title: 'Rate Summary',
      rating: {
        notRated: 'Not rated yet',
        rated: '{rating}/5 stars'
      },
      comment: {
        label: 'Your Comment',
        placeholder: 'What do you think about this summary?'
      },
      submit: 'Submit Feedback'
    }
  },
  footer: {
    about: {
      title: 'About',
      description: 'VideoAI is an AI-powered tool for generating YouTube video transcripts and summaries.'
    },
    quickLinks: {
      title: 'Quick Links',
      home: 'Home',
      about: 'About'
    },
    contact: {
      title: 'Contact',
      description: 'Have questions? Contact us at {email}',
      email: 'support@videoai.com'
    }
  },
  errors: {
    videoFetchFailed: 'Failed to fetch video details. Please try again.',
    summaryFailed: 'Failed to generate summary. Please try again.',
    invalidUrl: 'Please enter a valid YouTube URL.',
    networkError: 'Network error. Please check your connection.',
    serverError: 'Server error. Please try again later.',
    feedbackFailed: 'An error occurred while submitting feedback'
  }
} 