import Link from "next/link";
export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-purple-100 flex">

      {/* Sidebar */}

      <div className="w-64 bg-black text-white p-6 min-h-screen">

        <h2 className="text-3xl font-bold">
          NDL AI
        </h2>

        <p className="text-gray-400 mt-2">
          One Library. Infinite Learning.
        </p>

        <div className="mt-10 space-y-6">

          <p className="cursor-pointer hover:text-blue-400">
            📚 Library
          </p>

          <p className="cursor-pointer hover:text-blue-400">
            🔍 Explore
          </p>

          <p className="cursor-pointer hover:text-blue-400">
            🤖 AI Tutor
          </p>

          <p className="cursor-pointer hover:text-blue-400">
            📝 Notes
          </p>

          <p className="cursor-pointer hover:text-blue-400">
            📊 Analytics
          </p>

          <p className="cursor-pointer hover:text-blue-400">
            ⚙ Settings
          </p>

        </div>

      </div>

      {/* Main content */}

      <div className="flex-1 p-8">

        {/* Hero */}

        <div className="bg-gradient-to-r from-indigo-700 via-purple-700 to-pink-600 rounded-3xl p-10 text-white shadow-2xl">

          <div className="flex justify-between items-center">

            <div>

              <h1 className="text-5xl font-bold">
                One Library. Infinite Learning.
              </h1>

              <p className="mt-4 text-lg">
                AI-powered National Knowledge Platform
              </p>

            </div>

            <select className="p-3 rounded-xl text-black">

              <option>English</option>
              <option>Hindi</option>
              <option>Tamil</option>
              <option>Bengali</option>
              <option>Marathi</option>
              <option>Telugu</option>

            </select>

          </div>

          <div className="mt-8">

            <input
              className="w-full p-4 rounded-xl text-black"
              placeholder="Search books, authors, subjects, journals..."
            />

          </div>

        </div>

        {/* Stats */}

        <div className="grid grid-cols-4 gap-6 mt-8">

          <div className="bg-white rounded-2xl p-5 shadow hover:scale-105 transition">
            <h3 className="text-gray-500">
              Resources
            </h3>

            <p className="text-3xl font-bold mt-2">
              50M+
            </p>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow hover:scale-105 transition">
            <h3 className="text-gray-500">
              Languages
            </h3>

            <p className="text-3xl font-bold mt-2">
              22
            </p>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow hover:scale-105 transition">
            <h3 className="text-gray-500">
              Institutions
            </h3>

            <p className="text-3xl font-bold mt-2">
              500+
            </p>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow hover:scale-105 transition">
            <h3 className="text-gray-500">
              Daily Readers
            </h3>

            <p className="text-3xl font-bold mt-2">
              1.2M
            </p>
          </div>

        </div>

        {/* Categories */}

        <h2 className="text-3xl font-bold mt-10">
          Explore Categories
        </h2>

        <div className="grid grid-cols-4 gap-6 mt-6">

          <div className="bg-white rounded-2xl p-6 shadow">
            📚 School Education
          </div>

          <div className="bg-white rounded-2xl p-6 shadow">
            🎓 Higher Education
          </div>

          <div className="bg-white rounded-2xl p-6 shadow">
            🔬 Research
          </div>

          <div className="bg-white rounded-2xl p-6 shadow">
            💼 Career Development
          </div>

        </div>

        {/* Featured Books */}

        <h2 className="text-3xl font-bold mt-10">
          Featured Books
        </h2>

        <div className="grid grid-cols-4 gap-6 mt-6">

        <Link href="/book">

<div className="bg-white p-6 rounded-2xl shadow cursor-pointer hover:scale-105 transition">

  <div className="h-48 bg-gradient-to-b from-blue-500 to-purple-600 rounded-xl">
  </div>

  <h3 className="font-bold mt-4">
    Artificial Intelligence
  </h3>

  <p className="text-sm text-gray-500">
    John McCarthy
  </p>

</div>

</Link>

          <div className="bg-white p-6 rounded-2xl shadow">

            <div className="h-48 bg-gradient-to-b from-green-500 to-blue-600 rounded-xl">
            </div>

            <h3 className="font-bold mt-4">
              Machine Learning Basics
            </h3>

            <p className="text-sm text-gray-500">
              Andrew Ng
            </p>

          </div>

          <div className="bg-white p-6 rounded-2xl shadow">

            <div className="h-48 bg-gradient-to-b from-orange-500 to-red-600 rounded-xl">
            </div>

            <h3 className="font-bold mt-4">
              Data Science
            </h3>

            <p className="text-sm text-gray-500">
              Data Academy
            </p>

          </div>

          <div className="bg-white p-6 rounded-2xl shadow">

            <div className="h-48 bg-gradient-to-b from-purple-500 to-pink-600 rounded-xl">
            </div>

            <h3 className="font-bold mt-4">
              Robotics
            </h3>

            <p className="text-sm text-gray-500">
              Tech Institute
            </p>

          </div>

        </div>

      </div>

    </main>
  )
}