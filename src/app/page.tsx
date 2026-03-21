import Link from "next/link";
import {
  Truck,
  MapPin,
  Clock,
  Shield,
  Package,
  Star,
  ChevronRight,
  Bike,
  Car,
  Footprints,
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2">
              <Truck className="h-8 w-8 text-violet-600" />
              <span className="text-xl font-bold text-gray-900">
                Peeap Shipping
              </span>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/track"
                className="text-gray-600 hover:text-gray-900 font-medium"
              >
                Track Package
              </Link>
              <Link
                href="/dashboard"
                className="bg-violet-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-violet-700 transition-colors"
              >
                Dashboard
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-gradient-to-br from-violet-600 via-violet-700 to-purple-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="max-w-3xl">
            <h1 className="text-4xl sm:text-5xl font-bold leading-tight">
              Fast & Reliable
              <br />
              Local Deliveries
            </h1>
            <p className="mt-6 text-lg text-violet-100 max-w-xl">
              Connect your store to a network of delivery drivers. Get packages
              to your customers quickly with real-time tracking and transparent
              pricing.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4">
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center bg-white text-violet-700 px-6 py-3 rounded-lg font-semibold hover:bg-violet-50 transition-colors"
              >
                Get Started
                <ChevronRight className="ml-2 h-5 w-5" />
              </Link>
              <Link
                href="#become-driver"
                className="inline-flex items-center justify-center border-2 border-white text-white px-6 py-3 rounded-lg font-semibold hover:bg-white/10 transition-colors"
              >
                Become a Driver
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-3xl font-bold text-violet-600">500+</div>
              <div className="text-sm text-gray-500 mt-1">
                Active Drivers
              </div>
            </div>
            <div>
              <div className="text-3xl font-bold text-violet-600">10K+</div>
              <div className="text-sm text-gray-500 mt-1">
                Deliveries Completed
              </div>
            </div>
            <div>
              <div className="text-3xl font-bold text-violet-600">30 min</div>
              <div className="text-sm text-gray-500 mt-1">
                Avg. Delivery Time
              </div>
            </div>
            <div>
              <div className="text-3xl font-bold text-violet-600">4.8</div>
              <div className="text-sm text-gray-500 mt-1">
                Driver Rating
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold">How It Works</h2>
            <p className="text-gray-500 mt-2">
              Three simple steps to get your packages delivered
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-violet-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Package className="h-8 w-8 text-violet-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2">1. Create Order</h3>
              <p className="text-gray-500">
                A customer places an order on your Peeap Store. A delivery job
                is automatically created with pickup and delivery details.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-violet-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <MapPin className="h-8 w-8 text-violet-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2">
                2. Driver Assigned
              </h3>
              <p className="text-gray-500">
                A nearby driver accepts the job, picks up the package from your
                store, and heads to the delivery address.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-violet-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Clock className="h-8 w-8 text-violet-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2">3. Track & Deliver</h3>
              <p className="text-gray-500">
                Track the delivery in real-time. Get notified when the package
                is picked up, in transit, and delivered.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold">Why Peeap Shipping</h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <Clock className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Real-Time Tracking</h3>
                <p className="text-sm text-gray-500">
                  Track every delivery with live status updates from pickup to
                  delivery.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <Shield className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Proof of Delivery</h3>
                <p className="text-sm text-gray-500">
                  Drivers can upload proof-of-delivery photos and collect
                  signatures.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                <Star className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Driver Ratings</h3>
                <p className="text-sm text-gray-500">
                  Rate your delivery experience. Top drivers earn more jobs and
                  higher payouts.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-violet-100 rounded-xl flex items-center justify-center">
                <Truck className="h-6 w-6 text-violet-600" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Multi-Vehicle</h3>
                <p className="text-sm text-gray-500">
                  Motorcycles, cars, bicycles, and foot couriers. Choose the
                  right vehicle for every delivery.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-rose-100 rounded-xl flex items-center justify-center">
                <MapPin className="h-6 w-6 text-rose-600" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Zone-Based Pricing</h3>
                <p className="text-sm text-gray-500">
                  Transparent pricing based on delivery zones, distance, and
                  package size.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center">
                <Package className="h-6 w-6 text-teal-600" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Store Integration</h3>
                <p className="text-sm text-gray-500">
                  Seamlessly integrated with Peeap Store. Deliveries are created
                  automatically from orders.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Become a Driver CTA */}
      <section id="become-driver" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-br from-violet-600 to-purple-700 rounded-2xl p-8 md:p-12 text-white">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold mb-4">Become a Driver</h2>
              <p className="text-violet-100 mb-8">
                Earn money on your own schedule. Deliver packages in your city
                using your motorcycle, car, bicycle, or on foot. Sign up today
                and start earning.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                <div className="bg-white/10 rounded-xl p-4 text-center">
                  <Bike className="h-8 w-8 mx-auto mb-2" />
                  <span className="text-sm">Motorcycle</span>
                </div>
                <div className="bg-white/10 rounded-xl p-4 text-center">
                  <Car className="h-8 w-8 mx-auto mb-2" />
                  <span className="text-sm">Car</span>
                </div>
                <div className="bg-white/10 rounded-xl p-4 text-center">
                  <Bike className="h-8 w-8 mx-auto mb-2" />
                  <span className="text-sm">Bicycle</span>
                </div>
                <div className="bg-white/10 rounded-xl p-4 text-center">
                  <Footprints className="h-8 w-8 mx-auto mb-2" />
                  <span className="text-sm">On Foot</span>
                </div>
              </div>
              <Link
                href="/dashboard"
                className="inline-flex items-center bg-white text-violet-700 px-6 py-3 rounded-lg font-semibold hover:bg-violet-50 transition-colors"
              >
                Sign Up as Driver
                <ChevronRight className="ml-2 h-5 w-5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Track Package */}
      <section className="bg-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-4">Track Your Package</h2>
            <p className="text-gray-500 mb-8">
              Enter your tracking number to see the status of your delivery.
            </p>
            <form
              action="/track"
              method="GET"
              className="flex gap-2"
            >
              <input
                type="text"
                name="q"
                placeholder="e.g. SHP-20260321-A1B2"
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
              />
              <button
                type="submit"
                className="bg-violet-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-violet-700 transition-colors"
              >
                Track
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Truck className="h-6 w-6 text-violet-400" />
                <span className="text-lg font-bold text-white">
                  Peeap Shipping
                </span>
              </div>
              <p className="text-sm">
                Fast, reliable local deliveries powered by the Peeap platform.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3">Platform</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a
                    href="https://my.peeap.com"
                    className="hover:text-white transition-colors"
                  >
                    Peeap Dashboard
                  </a>
                </li>
                <li>
                  <a
                    href="https://store.peeap.com"
                    className="hover:text-white transition-colors"
                  >
                    Peeap Store
                  </a>
                </li>
                <li>
                  <a
                    href="https://docs.peeap.com"
                    className="hover:text-white transition-colors"
                  >
                    API Docs
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3">Shipping</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link
                    href="/track"
                    className="hover:text-white transition-colors"
                  >
                    Track Package
                  </Link>
                </li>
                <li>
                  <Link
                    href="/dashboard"
                    className="hover:text-white transition-colors"
                  >
                    Dashboard
                  </Link>
                </li>
                <li>
                  <a
                    href="#become-driver"
                    className="hover:text-white transition-colors"
                  >
                    Become a Driver
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3">Support</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a
                    href="mailto:support@peeap.com"
                    className="hover:text-white transition-colors"
                  >
                    support@peeap.com
                  </a>
                </li>
                <li>
                  <a
                    href="https://status.peeap.com"
                    className="hover:text-white transition-colors"
                  >
                    System Status
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-sm text-center">
            &copy; {new Date().getFullYear()} Peeap. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
