-- Drop legacy broad service SELECT policies left by older schema imports.

DROP POLICY IF EXISTS "Public can view services" ON public.services;
DROP POLICY IF EXISTS "Services are viewable by everyone" ON public.services;

COMMENT ON TABLE public.services IS
  'Services are public-readable only when active; inactive service rows require business-manager access.';
