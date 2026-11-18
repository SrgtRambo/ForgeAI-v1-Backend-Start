// Social media starter kit generator.
// Produces structured content packages: brand voice, bios, captions, hashtags, content calendar.
export function createSocialKit({ businessName, industry, description, tone }) {
  const t = tone || "professional";
  const kit = {
    businessName,
    industry: industry || "General",
    brandVoice: {
      tone: t,
      personality: ["Authentic", "Helpful", "Engaging"],
      doSay: ["Share value", "Be consistent", "Engage with audience"],
      dontSay: ["Overpromise", "Use jargon", "Ignore comments"],
    },
    profiles: {
      instagram: {
        bio: `${businessName} | ${industry || "Business"} | ${description?.slice(0, 80) || "Your trusted partner"}`,
        highlights: ["About", "Services", "Reviews", "Contact"],
      },
      facebook: {
        about: `${businessName} provides ${industry || "quality"} services. ${description || ""}`.trim(),
        cta: "Contact Us",
      },
      tiktok: {
        bio: `${businessName} 🎯 ${industry || "Business"} tips & insights`,
        contentPillars: ["Educational", "Behind-the-scenes", "Customer stories", "Tips & tricks"],
      },
      linkedin: {
        headline: `${businessName} — ${industry || "Business"} Solutions`,
        about: `${businessName} helps customers with ${industry || "quality"} services. ${description || ""}`.trim(),
      },
    },
    posts: [
      { type: "announcement", platform: "instagram", caption: `🚀 Welcome to ${businessName}! We're excited to serve you. #${businessName.replace(/\s/g, "")} #NewBusiness`, hashtags: [`#${businessName.replace(/\s/g, "")}`, "#NewBusiness", "#Launch"] },
      { type: "tip", platform: "instagram", caption: `💡 Pro tip: ${description?.slice(0, 60) || "Quality service matters"}. Save this for later!`, hashtags: ["#Tips", "#Business", "#Value"] },
      { type: "testimonial", platform: "facebook", caption: `"Great service!" — Happy Customer. Experience ${businessName} today.`, hashtags: ["#Testimonial", "#CustomerLove"] },
      { type: "behind-the-scenes", platform: "tiktok", caption: `Behind the scenes at ${businessName} 🎬`, hashtags: ["#BTS", "#TeamWork", "#Business"] },
      { type: "offer", platform: "instagram", caption: `🎉 Special offer from ${businessName}! Contact us today.`, hashtags: ["#Offer", "#Deal", "#Promo"] },
      { type: "educational", platform: "linkedin", caption: `Understanding ${industry || "our industry"}: key insights from ${businessName}.`, hashtags: ["#Industry", "#Insights", "#Professional"] },
    ],
    contentCalendar: Array.from({ length: 7 }, (_, i) => ({
      day: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][i],
      postType: ["announcement", "tip", "testimonial", "behind-the-scenes", "offer", "educational", "engagement"][i],
      platform: ["instagram", "instagram", "facebook", "tiktok", "instagram", "linkedin", "instagram"][i],
    })),
    hashtagSets: {
      branded: [`#${businessName.replace(/\s/g, "")}`],
      industry: [`#${(industry || "business").replace(/\s/g, "")}`, "#SmallBusiness", "#Entrepreneur"],
      trending: ["#Growth", "#Success", "#Innovation"],
    },
  };
  return kit;
}
