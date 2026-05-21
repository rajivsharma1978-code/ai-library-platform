import Link from "next/link";
export default function BookPage() {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-purple-100 p-8">
  
        <div className="grid grid-cols-3 gap-8">
  
          <div className="bg-white p-8 rounded-3xl shadow">
  
            <div className="h-96 rounded-2xl bg-gradient-to-b from-blue-600 to-purple-700">
            </div>
  
          </div>
  
          <div className="col-span-2">
  
            <h1 className="text-5xl font-bold">
              Artificial Intelligence
            </h1>
  
            <p className="text-gray-500 mt-3">
              By John McCarthy
            </p>
  
            <div className="flex gap-4 mt-6">
  
            <Link href="/reader">

<button className="bg-blue-600 text-white px-6 py-3 rounded-xl">
  Read Now
</button>

</Link>
  
              <button className="bg-black text-white px-6 py-3 rounded-xl">
                Ask AI About This Book
              </button>
  
            </div>
  
            <div className="bg-white p-6 rounded-2xl shadow mt-8">
  
              <h2 className="font-bold text-2xl">
                About this Book
              </h2>
  
              <p className="mt-4">
                Artificial Intelligence explores machine learning,
                decision-making systems and intelligent automation.
              </p>
  
            </div>
  
            <div className="bg-white p-6 rounded-2xl shadow mt-6">
  
              <h2 className="font-bold text-2xl">
                AI Insights
              </h2>
  
              <ul className="mt-4 space-y-3">
                <li>✓ Beginner Friendly</li>
                <li>✓ Estimated reading time: 6 hrs</li>
                <li>✓ Related topics: Robotics, ML</li>
              </ul>
  
            </div>
  
          </div>
  
        </div>
  
      </main>
    )
  }