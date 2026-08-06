namespace Sample
{
    public class Program
    {
        public static int Process()
        {
            int local = 1;
            return local;
        }
    }

    public class Worker
    {
        public int Process()
        {
            int local = 2;
            return local;
        }
    }
}
